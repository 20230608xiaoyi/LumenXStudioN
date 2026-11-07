"""Agnes AI provider adapter (https://platform.agnes-ai.cn / apihub.agnes-ai.com).

OpenAI-compatible aggregator:
- Image: sync `POST /v1/images/generations` (OpenAI images API)
- Video: async `POST /v1/videos` (text / keyframe modes) + `GET /agnesapi` polling

Env vars:
- AGNES_API_KEY      (required)
- AGNES_BASE_URL     (default https://apihub.agnes-ai.com)
- AGNES_VIDEO_MODEL  (default agnes-video-2.5)
- AGNES_IMAGE_MODEL  (default agnes-image-2.0-flash)
"""

import base64
import logging
import mimetypes
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from .base import VideoGenModel
from .image import ImageGenModel

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://apihub.agnes-ai.com"

POLL_INTERVAL = 10
MAX_WAIT = 900

VALID_SECONDS = (4, 5, 6, 7, 8, 9, 10, 11, 12)
VALID_ASPECT_RATIOS = ("21:9", "16:9", "4:3", "1:1", "3:4", "9:16")
VALID_SIZES = ("720P", "1080P", "1K", "2K")


def _get_api_key() -> str:
    key = os.getenv("AGNES_API_KEY", "")
    if not key:
        raise RuntimeError("AGNES_API_KEY not set in environment")
    return key


def _get_base_url() -> str:
    base = (os.getenv("AGNES_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    # 用户可能粘贴带 /v1 后缀的地址；路径由下方调用自行拼接，这里去掉避免 /v1/v1
    if base.endswith("/v1"):
        base = base[: -len("/v1")]
    return base


def _auth_headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }


def _request_with_retry(method: str, url: str, max_retries: int = 3, **kwargs) -> requests.Response:
    """HTTP request with exponential backoff retry on transient errors."""
    for attempt in range(max_retries):
        try:
            resp = requests.request(method, url, **kwargs)
            if resp.status_code in (429, 502, 503, 504) and attempt < max_retries - 1:
                wait = min(2 ** attempt * 5, 60)
                logger.warning(f"[Agnes] HTTP {resp.status_code}, retry in {wait}s (attempt {attempt + 1})")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp
        except requests.exceptions.ConnectionError:
            if attempt < max_retries - 1:
                wait = min(2 ** attempt * 5, 60)
                logger.warning(f"[Agnes] Connection error, retry in {wait}s (attempt {attempt + 1})")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("Agnes: max retries exceeded")


def _encode_file_to_data_uri(file_path: str) -> str:
    mime, _ = mimetypes.guess_type(file_path)
    if not mime:
        mime = "application/octet-stream"
    with open(file_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime};base64,{data}"


def _resolve_image_input(img_url: Optional[str] = None, img_path: Optional[str] = None) -> Optional[str]:
    """Resolve image to a URL or base64 data URI for Agnes."""
    if img_path and os.path.exists(img_path):
        return _encode_file_to_data_uri(img_path)
    if img_url:
        if img_url.startswith(("http://", "https://", "data:")):
            return img_url
        potential = os.path.join("output", img_url)
        if os.path.exists(potential):
            return _encode_file_to_data_uri(potential)
        if os.path.exists(img_url):
            return _encode_file_to_data_uri(img_url)
    return None


def _download_file(url: str, output_path: str) -> str:
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    resp = _request_with_retry("GET", url, timeout=120, stream=True)
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)
    return output_path


class AgnesImageModel(ImageGenModel):
    """Agnes image generation via OpenAI-compatible /v1/images/generations."""

    def generate(self, prompt: str, output_path: str, **kwargs) -> Tuple[str, float]:
        start_time = time.time()
        model = kwargs.get("model_name") or os.getenv("AGNES_IMAGE_MODEL", "agnes-image-2.0-flash")
        n = kwargs.get("n", 1) or 1
        size = self._normalize_size(kwargs.get("size"))

        body: Dict[str, Any] = {"model": model, "prompt": prompt, "n": n, "response_format": "b64_json"}
        if size:
            body["size"] = size

        url = f"{_get_base_url()}/v1/images/generations"
        logger.info(f"[Agnes] POST /v1/images/generations (model={model}, size={size})")
        resp = _request_with_retry("POST", url, headers=_auth_headers(), json=body, timeout=300)
        data = resp.json()

        images = data.get("data") or []
        if not images:
            raise RuntimeError(f"Agnes: no image in response: {str(data)[:300]}")

        first = images[0]
        b64 = first.get("b64_json")
        if b64:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(base64.b64decode(b64))
        else:
            image_url = first.get("url") or first.get("image_url")
            if not image_url:
                raise RuntimeError(f"Agnes: cannot extract image from response: {str(data)[:300]}")
            _download_file(image_url, output_path)

        generation_time = time.time() - start_time
        logger.info(f"[Agnes] image done in {generation_time:.1f}s -> {output_path}")
        return output_path, generation_time

    @staticmethod
    def _normalize_size(size: Optional[str]) -> Optional[str]:
        """DashScope uses 1024*768 style; Agnes expects WxH or nothing."""
        if not size:
            return None
        normalized = str(size).replace("*", "x").lower()
        try:
            w, h = [int(d) for d in normalized.split("x")]
        except (ValueError, AttributeError):
            return None
        return f"{w}x{h}"


class AgnesVideoModel(VideoGenModel):
    """Agnes video generation via async /v1/videos + /agnesapi polling."""

    # 目录条目 id 形如 agnes/agnes-video-2.5-flash 或 agnes-video-2.5-flash-i2v/-t2v/-r2v，
    # 需去掉 family 前缀与模式后缀才是 API 模型名。
    _MODE_SUFFIXES = ("-i2v", "-t2v", "-r2v")

    @classmethod
    def _resolve_api_model(cls, selected: Optional[str]) -> str:
        raw = (selected or "").strip()
        if raw:
            if raw.startswith("agnes/"):
                raw = raw.split("/", 1)[1].strip()
            for suffix in cls._MODE_SUFFIXES:
                if raw.endswith(suffix):
                    raw = raw[: -len(suffix)]
            if raw:
                return raw
        return os.getenv("AGNES_VIDEO_MODEL", "agnes-video-2.5")

    def generate(self, prompt: str, output_path: str, img_url: Optional[str] = None,
                 img_path: Optional[str] = None, **kwargs) -> Tuple[str, float]:
        start_time = time.time()
        model = self._resolve_api_model(kwargs.get("model"))
        base_url = _get_base_url()

        generation_mode = kwargs.get("generation_mode", "")
        ref_image_urls: List[str] = kwargs.get("ref_image_urls") or []

        first_frame = _resolve_image_input(img_url, img_path)

        # reference 模式（R2V 工作流）：多参考图，API 上限 5 张
        ref_images: List[str] = []
        for ref in ref_image_urls:
            resolved = _resolve_image_input(ref, None)
            if resolved:
                ref_images.append(resolved)
        if len(ref_images) > 5:
            logger.warning(f"[Agnes] limiting reference images from {len(ref_images)} to 5")
            ref_images = ref_images[:5]

        if ref_images:
            mode = "reference"
        elif first_frame:
            mode = "keyframe"
        else:
            mode = "text"

        body: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "mode": mode,
            "seconds": self._normalize_seconds(kwargs.get("duration")),
            "size": self._normalize_size(kwargs.get("resolution")),
            "aspect_ratio": self._normalize_aspect_ratio(kwargs.get("aspect_ratio")),
            "n": 1,
        }
        body = {k: v for k, v in body.items() if v is not None}
        if mode == "keyframe":
            body["keyframe"] = {"first_frame": first_frame}
        if mode == "reference":
            body["images"] = ref_images
        if kwargs.get("seed") is not None:
            body["seed"] = int(kwargs["seed"])

        logger.info(
            f"[Agnes] POST /v1/videos (model={model}, mode={mode}"
            + (f", refs={len(ref_images)}" if mode == "reference" else "")
            + ")"
        )
        resp = _request_with_retry("POST", f"{base_url}/v1/videos", headers=_auth_headers(), json=body, timeout=60)
        data = resp.json()
        video_id = data.get("video_id") or data.get("id") or (data.get("data") or {}).get("video_id")
        if not video_id:
            raise RuntimeError(f"Agnes: no video_id in response: {str(data)[:300]}")
        logger.info(f"[Agnes] video task submitted: {video_id}")

        result = self._poll_video(base_url, model, video_id)
        video_url = self._extract_video_url(result)
        _download_file(video_url, output_path)

        generation_time = time.time() - start_time
        logger.info(f"[Agnes] video done in {generation_time:.1f}s -> {output_path}")
        return output_path, generation_time

    def _poll_video(self, base_url: str, model: str, video_id: str) -> Dict[str, Any]:
        poll_url = f"{base_url}/agnesapi"
        elapsed = 0
        while elapsed < MAX_WAIT:
            time.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL
            resp = _request_with_retry(
                "GET", poll_url,
                headers=_auth_headers(),
                params={"video_id": video_id, "model_name": model},
                timeout=30,
            )
            data = resp.json()
            status = str(data.get("status") or "").lower()
            logger.info(f"[Agnes] poll status: {status} ({elapsed}s)")
            if status in ("completed", "succeeded", "success"):
                return data
            if status in ("failed", "error", "cancelled", "canceled"):
                msg = data.get("error") or data.get("message") or "unknown error"
                raise RuntimeError(f"Agnes video task {status}: {msg}")
        raise RuntimeError(f"Agnes video task timed out after {MAX_WAIT}s")

    @staticmethod
    def _extract_video_url(result: Dict[str, Any]) -> str:
        for key in ("url", "video_url"):
            if result.get(key):
                return result[key]
        for container in ("data", "output", "video"):
            payload = result.get(container)
            if isinstance(payload, dict):
                for key in ("url", "video_url"):
                    if payload.get(key):
                        return payload[key]
            if isinstance(payload, list) and payload:
                first = payload[0]
                if isinstance(first, str):
                    return first
                if isinstance(first, dict):
                    for key in ("url", "video_url"):
                        if first.get(key):
                            return first[key]
        raise RuntimeError(f"Agnes: cannot extract video URL from result: {str(result)[:300]}")

    @staticmethod
    def _normalize_seconds(duration: Any) -> Optional[str]:
        try:
            seconds = int(round(float(duration)))
        except (TypeError, ValueError):
            return "5"
        return str(min(max(seconds, VALID_SECONDS[0]), VALID_SECONDS[-1]))

    @staticmethod
    def _normalize_size(resolution: Any) -> Optional[str]:
        if not resolution:
            return None
        normalized = str(resolution).strip().upper()
        return normalized if normalized in VALID_SIZES else None

    @staticmethod
    def _normalize_aspect_ratio(ratio: Any) -> Optional[str]:
        if not ratio:
            return None
        normalized = str(ratio).strip()
        return normalized if normalized in VALID_ASPECT_RATIOS else None
