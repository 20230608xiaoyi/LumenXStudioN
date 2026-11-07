"""Local ComfyUI image generation adapter.

Talks to a local ComfyUI instance (default http://127.0.0.1:8188) via its
native API: POST /prompt -> poll GET /history/{prompt_id} -> GET /view.

Supports two modes:
- T2I (no reference images): built-in SD checkpoint txt2img graph, or a custom
  workflow JSON template via env ``COMFYUI_WORKFLOW_IMAGE`` (API-format export).
- I2I (with reference images): built-in img2img graph (denoise 0.6) or custom
  template via env ``COMFYUI_WORKFLOW_I2I``.

Custom templates may contain placeholders that get substituted at runtime:
``{{PROMPT}}`` ``{{NEGATIVE_PROMPT}}`` ``{{WIDTH}}`` ``{{HEIGHT}}``
``{{SEED}}`` ``{{CHECKPOINT}}`` ``{{IMAGE_1}}``..``{{IMAGE_9}}`` (uploaded
reference image filenames as seen by the ComfyUI server).

Environment variables:
- ``COMFYUI_BASE_URL``   default http://127.0.0.1:8188
- ``COMFYUI_WORKFLOW_IMAGE``  path to API-format JSON template for T2I
- ``COMFYUI_WORKFLOW_I2I``    path to API-format JSON template for I2I
- ``COMFYUI_CHECKPOINT``      checkpoint name for built-in graphs (e.g. flux2-dev.safetensors)
- ``COMFYUI_TIMEOUT``         polling timeout seconds (default 600)
"""

import json
import os
import random
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests

from ..utils import get_logger
from .image import ImageGenModel

logger = get_logger(__name__)

DEFAULT_BASE_URL = "http://127.0.0.1:8188"
UPLOAD_SUBFOLDER = "lumenx"


def _base_url() -> str:
    return (os.getenv("COMFYUI_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def _checkpoint_name() -> str:
    return os.getenv("COMFYUI_CHECKPOINT", "").strip()


def _load_template(env_key: str) -> Optional[Dict[str, Any]]:
    path = os.getenv(env_key, "").strip()
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise RuntimeError(f"Failed to load ComfyUI workflow template '{path}': {e}")


def _default_t2i_graph(prompt: str, negative_prompt: str, width: int, height: int, seed: int) -> Dict[str, Any]:
    """Built-in SD checkpoint txt2img graph (API format)."""
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": _checkpoint_name()}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_prompt, "clip": ["1", 0]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": 25, "cfg": 7.0,
                "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0,
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"filename_prefix": "lumenx", "images": ["6", 0]}},
    }


def _default_i2i_graph(prompt: str, negative_prompt: str, seed: int, image_name: str, denoise: float = 0.6) -> Dict[str, Any]:
    """Built-in SD checkpoint img2img graph (API format)."""
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": _checkpoint_name()}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 0]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_prompt, "clip": ["1", 0]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "5": {"class_type": "VAEEncode", "inputs": {"pixels": ["4", 0], "vae": ["1", 2]}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": 25, "cfg": 7.0,
                "sampler_name": "euler", "scheduler": "normal", "denoise": denoise,
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
                "latent_image": ["5", 0],
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "lumenx", "images": ["7", 0]}},
    }


def _apply_placeholders(node: Any, mapping: Dict[str, Any]) -> Any:
    """Recursively substitute {{PLACEHOLDER}} tokens inside a workflow graph.

    Values that are exactly ``{{WIDTH}}`` / ``{{HEIGHT}}`` / ``{{SEED}}`` are
    converted to int so API-format integer fields keep working.
    """
    if isinstance(node, dict):
        return {k: _apply_placeholders(v, mapping) for k, v in node.items()}
    if isinstance(node, list):
        return [_apply_placeholders(v, mapping) for v in node]
    if isinstance(node, str):
        key = node.strip()
        if key in ("{{WIDTH}}", "{{HEIGHT}}", "{{SEED}}") and key in mapping:
            return int(mapping[key])
        result = node
        for name, value in mapping.items():
            token = "{{" + name + "}}"
            if token in result:
                result = result.replace(token, str(value))
        return result
    return node


class ComfyUIImageModel(ImageGenModel):
    """Image generation via a local ComfyUI server."""

    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config or {})

    # ---- low-level helpers -------------------------------------------------

    def _upload_image(self, image_path: str) -> str:
        """Upload a local image to ComfyUI inputs; return server-side name."""
        url = f"{_base_url()}/upload/image"
        filename = os.path.basename(image_path)
        with open(image_path, "rb") as f:
            resp = requests.post(
                url,
                files={"image": (filename, f, "application/octet-stream")},
                data={"overwrite": "true", "subfolder": UPLOAD_SUBFOLDER, "type": "input"},
                timeout=60,
            )
        resp.raise_for_status()
        info = resp.json()
        name = info.get("name") or filename
        subfolder = info.get("subfolder") or ""
        return f"{subfolder}/{name}" if subfolder else name

    def _collect_output(self, prompt_id: str, timeout: float) -> Dict[str, Any]:
        """Poll /history/{prompt_id} until completion; return output entry."""
        deadline = time.time() + timeout
        history_url = f"{_base_url()}/history/{prompt_id}"
        while time.time() < deadline:
            resp = requests.get(history_url, timeout=30)
            resp.raise_for_status()
            history = resp.json()
            entry = history.get(prompt_id)
            if entry:
                status = entry.get("status", {})
                if status.get("status_str") == "error":
                    raise RuntimeError(
                        f"ComfyUI workflow execution failed (prompt_id={prompt_id}). "
                        "Check ComfyUI console for node errors."
                    )
                if status.get("completed") or entry.get("outputs"):
                    return entry
            time.sleep(1.5)
        raise RuntimeError(f"ComfyUI generation timed out after {int(timeout)}s (prompt_id={prompt_id})")

    def _download_result(self, entry: Dict[str, Any], output_path: str) -> None:
        outputs = entry.get("outputs", {})
        image_info = None
        for node_output in outputs.values():
            images = node_output.get("images")
            if images:
                image_info = images[0]
                break
        if not image_info:
            raise RuntimeError("ComfyUI finished but produced no images (no SaveImage node output?).")

        params = {
            "filename": image_info.get("filename", ""),
            "subfolder": image_info.get("subfolder", ""),
            "type": image_info.get("type", "output"),
        }
        resp = requests.get(f"{_base_url()}/view", params=params, timeout=120)
        resp.raise_for_status()

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        temp_path = output_path + ".tmp"
        with open(temp_path, "wb") as f:
            f.write(resp.content)
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(temp_path, output_path)

    # ---- public API --------------------------------------------------------

    def generate(self, prompt: str, output_path: str, ref_image_path: str = None,
                 ref_image_paths: list = None, model_name: str = None, **kwargs) -> Tuple[str, float]:
        start_time = time.time()

        refs: List[str] = []
        if ref_image_path:
            refs.append(ref_image_path)
        if ref_image_paths:
            refs.extend(ref_image_paths)
        refs = list(dict.fromkeys(refs))

        size = str(kwargs.get("size") or self.config.get("size") or "1024*1024")
        if "*" in size:
            width, height = size.split("*", 1)
        elif "x" in size:
            width, height = size.split("x", 1)
        else:
            width, height = "1024", "1024"
        width, height = int(float(width)), int(float(height))

        negative_prompt = kwargs.get("negative_prompt") or self.config.get("negative_prompt") or ""
        seed = kwargs.get("seed") or random.randint(0, 2**63 - 1)

        # Build the workflow graph: custom template if configured, else built-in default.
        if refs:
            template = _load_template("COMFYUI_WORKFLOW_I2I")
        else:
            template = _load_template("COMFYUI_WORKFLOW_IMAGE")
        use_template = template is not None

        # Upload reference images (I2I).
        uploaded_names: List[str] = []
        mapping: Dict[str, Any] = {
            "PROMPT": prompt,
            "NEGATIVE_PROMPT": negative_prompt,
            "WIDTH": width,
            "HEIGHT": height,
            "SEED": seed,
            "CHECKPOINT": _checkpoint_name(),
        }
        if refs:
            if len(refs) > 1 and not use_template:
                logger.warning("Built-in ComfyUI I2I graph supports one reference image; using the first.")
            for i, path in enumerate(refs[:9], start=1):
                try:
                    uploaded_names.append(self._upload_image(path))
                except Exception as e:
                    raise RuntimeError(f"Failed to upload reference image '{path}' to ComfyUI: {e}")
                mapping[f"IMAGE_{i}"] = uploaded_names[-1]

        if use_template:
            graph = _apply_placeholders(json.loads(json.dumps(template)), mapping)
            remaining = [name for name in ("PROMPT", "WIDTH", "HEIGHT", "SEED", "CHECKPOINT")
                         if f"{{{{{name}}}}}" in json.dumps(graph)]
            if remaining:
                logger.warning(f"ComfyUI template still contains unsubstituted placeholders: {remaining}")
            logger.info(f"[ComfyUI] Using custom workflow template with {len(uploaded_names)} uploaded reference(s)")
        else:
            if refs:
                graph = _default_i2i_graph(prompt, negative_prompt, seed, uploaded_names[0])
            else:
                if not _checkpoint_name():
                    raise RuntimeError(
                        "ComfyUI built-in graph requires COMFYUI_CHECKPOINT env var "
                        "(or set COMFYUI_WORKFLOW_IMAGE to a custom workflow template)."
                    )
                graph = _default_t2i_graph(prompt, negative_prompt, width, height, seed)
            logger.info(f"[ComfyUI] Using built-in {'I2I' if refs else 'T2I'} graph, size={width}x{height}")

        client_id = uuid.uuid4().hex
        try:
            resp = requests.post(
                f"{_base_url()}/prompt",
                json={"prompt": graph, "client_id": client_id},
                timeout=30,
            )
            resp.raise_for_status()
            prompt_id = resp.json().get("prompt_id")
            if not prompt_id:
                raise RuntimeError(f"ComfyUI /prompt returned no prompt_id: {resp.text[:300]}")
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to queue ComfyUI prompt at {_base_url()}: {e}")

        timeout = float(os.getenv("COMFYUI_TIMEOUT", "600"))
        entry = self._collect_output(prompt_id, timeout)
        self._download_result(entry, output_path)

        generation_time = time.time() - start_time
        logger.info(f"[ComfyUI] done in {generation_time:.1f}s -> {output_path}")
        return output_path, generation_time


def comfyui_status() -> Dict[str, Any]:
    """Probe the local ComfyUI server (GET /system_stats)."""
    base = _base_url()
    result: Dict[str, Any] = {"configured": True, "base_url": base, "reachable": False, "system": None, "error": None}
    try:
        resp = requests.get(f"{base}/system_stats", timeout=3)
        resp.raise_for_status()
        data = resp.json()
        result["reachable"] = True
        result["system"] = {
            "comfyui_version": data.get("system", {}).get("comfyui_version"),
            "python_version": data.get("system", {}).get("python_version"),
            "device_name": (data.get("devices") or [{}])[0].get("name"),
            "vram_total_gb": round(((data.get("devices") or [{}])[0].get("vram_total") or 0) / (1024 ** 3), 1),
        }
    except Exception as e:
        result["error"] = str(e)
    return result
