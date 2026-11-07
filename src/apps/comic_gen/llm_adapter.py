"""
LLM Adapter - Unified interface for DashScope and OpenAI-compatible APIs.

Supports three providers:
  - dashscope (default): Alibaba Cloud DashScope via OpenAI-compatible endpoint
  - openai: Any OpenAI-compatible API (OpenAI, DeepSeek, Ollama, etc.)
  - agnes: Agnes AI (https://platform.agnes-ai.cn) via OpenAI-compatible endpoint,
    shares AGNES_API_KEY / AGNES_BASE_URL with the image & video adapters

Configuration via environment variables:
  LLM_PROVIDER=dashscope|openai|agnes
  DASHSCOPE_API_KEY=...
  OPENAI_API_KEY=...
  OPENAI_BASE_URL=https://api.openai.com/v1
  OPENAI_MODEL=gpt-4o
  AGNES_API_KEY=...
  AGNES_BASE_URL=https://apihub.agnes-ai.com
  AGNES_MODEL=agnes-2.5-pro-beta
"""
import os
import logging
from typing import Dict, List, Optional, Any

from ...utils.endpoints import get_provider_base_url

logger = logging.getLogger(__name__)


def _openai_compatible_base(base_url: str) -> str:
    """Normalize an OpenAI-compatible base URL to end with exactly one /v1.

    Users often paste the full endpoint (e.g. https://api.agnes-ai.cn/v1);
    strip a trailing /v1 before appending our own so paths never double up.
    """
    base = (base_url or "").rstrip("/")
    if base.endswith("/v1"):
        base = base[: -len("/v1")]
    return f"{base}/v1"


class LLMAdapter:
    """Unified LLM call interface supporting DashScope and OpenAI-compatible APIs."""

    def __init__(self):
        self._client = None
        self._client_fingerprint: Optional[tuple] = None
        logger.info(f"LLM Adapter initialized with provider: {self.provider}")

    @property
    def provider(self) -> str:
        # 每次调用时读取：设置页 POST /config/env 会在运行期改写 os.environ，
        # 长生命周期实例（如 pipeline 内的 ScriptProcessor）也要跟随切换。
        return (os.getenv("LLM_PROVIDER", "") or "dashscope").strip().lower()

    @property
    def is_configured(self) -> bool:
        if self.provider == "openai":
            return bool(os.getenv("OPENAI_API_KEY"))
        if self.provider == "agnes":
            return bool(os.getenv("AGNES_API_KEY"))
        return bool(os.getenv("DASHSCOPE_API_KEY"))

    def _fingerprint(self) -> tuple:
        """Client 缓存指纹：provider / 凭据 / 端点任一变化即重建 client。"""
        if self.provider == "openai":
            return ("openai", os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_BASE_URL"))
        if self.provider == "agnes":
            return ("agnes", os.getenv("AGNES_API_KEY"), get_provider_base_url("AGNES"))
        return ("dashscope", os.getenv("DASHSCOPE_API_KEY"), get_provider_base_url("DASHSCOPE"))

    def _get_client(self):
        """Get or create the OpenAI-compatible client (lazy, cached on fingerprint)."""
        fingerprint = self._fingerprint()
        if self._client is None or fingerprint != self._client_fingerprint:
            try:
                from openai import OpenAI
            except ImportError:
                raise RuntimeError(
                    "openai package not installed. Run: pip install openai>=1.0.0"
                )

            if self.provider == "openai":
                self._client = OpenAI(
                    api_key=os.getenv("OPENAI_API_KEY"),
                    base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
                )
            elif self.provider == "agnes":
                # Agnes AI：OpenAI 兼容聚合商，凭据与图像/视频适配器共用
                self._client = OpenAI(
                    api_key=os.getenv("AGNES_API_KEY"),
                    base_url=_openai_compatible_base(get_provider_base_url("AGNES")),
                )
            else:
                # DashScope uses OpenAI-compatible endpoint
                self._client = OpenAI(
                    api_key=os.getenv("DASHSCOPE_API_KEY"),
                    base_url=f"{get_provider_base_url('DASHSCOPE')}/compatible-mode/v1",
                )
            self._client_fingerprint = fingerprint
        return self._client

    # DashScope qwen 系列：首选 qwen3.6-plus（最新稳定），不可用时回退到 qwen-plus
    # alias（始终指向最新稳定通用版）。这里维护 fallback chain 而不是硬写一个名字，
    # 避免 DashScope 新版本上下线时整条 LLM 链断掉。
    _DASHSCOPE_MODEL_FALLBACK_CHAIN = ["qwen3.6-plus", "qwen-plus"]

    def _get_default_model(self) -> str:
        if self.provider == "openai":
            return os.getenv("OPENAI_MODEL", "gpt-4o")
        if self.provider == "agnes":
            return (os.getenv("AGNES_MODEL", "") or "").strip() or "agnes-2.5-pro-beta"
        return self._DASHSCOPE_MODEL_FALLBACK_CHAIN[0]

    def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        response_format: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Send a chat completion request and return the response content.

        Args:
            messages: List of {"role": ..., "content": ...} dicts
            model: Model name override (uses provider default if None)
            response_format: Optional {"type": "json_object"} constraint

        Returns:
            The assistant's response content as a string.

        Raises:
            RuntimeError: If the API call fails.
        """
        client = self._get_client()

        # 显式 model override 路径：单次尝试，失败就抛。
        if model:
            return self._chat_once(client, model, messages, response_format)

        # Provider 默认路径：DashScope 走 fallback chain，OpenAI/Agnes 单次尝试。
        if self.provider in ("openai", "agnes"):
            return self._chat_once(client, self._get_default_model(), messages, response_format)

        last_err: Optional[Exception] = None
        for idx, candidate in enumerate(self._DASHSCOPE_MODEL_FALLBACK_CHAIN):
            try:
                return self._chat_once(client, candidate, messages, response_format)
            except RuntimeError as e:
                # 仅在 "模型不存在 / 不可用" 类错误时回退；其他错误（鉴权、限流、网络）
                # 直接抛，不浪费第二次重试。判定关键字宽松匹配 DashScope 文案。
                msg = str(e).lower()
                is_model_unavailable = any(k in msg for k in (
                    "model not found", "invalidmodel", "model_not_found",
                    "no such model", "not supported", "modelnotfound", "404",
                ))
                last_err = e
                if is_model_unavailable and idx < len(self._DASHSCOPE_MODEL_FALLBACK_CHAIN) - 1:
                    next_candidate = self._DASHSCOPE_MODEL_FALLBACK_CHAIN[idx + 1]
                    logger.warning(
                        "DashScope model %s unavailable (%s); falling back to %s",
                        candidate, e, next_candidate,
                    )
                    continue
                raise
        # 理论上不可达（最后一次失败已 raise），保留兜底
        raise last_err if last_err else RuntimeError("DashScope: no models available")

    def _chat_once(
        self,
        client,
        model: str,
        messages: List[Dict[str, str]],
        response_format: Optional[Dict[str, str]],
    ) -> str:
        kwargs: Dict[str, Any] = {
            "model": model,
            "messages": messages,
        }
        if response_format:
            kwargs["response_format"] = response_format

        try:
            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
        except Exception as e:
            provider_label = {
                "openai": "OpenAI",
                "agnes": "Agnes",
            }.get(self.provider, "DashScope")
            raise RuntimeError(f"{provider_label} API error: {e}") from e
