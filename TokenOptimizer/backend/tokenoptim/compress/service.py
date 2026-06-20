"""Client for the shared compression service (the Cloud Run LLMLingua-2 endpoint).

Every Python caller (library, MCP, proxy) routes prompt compression through this one client, so
they all get identical results from the same model. The endpoint is configured via
``TS_COMPRESS_URL`` or ``tokenoptim.configure(compress_url=...)``. When no endpoint is set or the call
fails, ``compress()`` returns ``None`` and the caller leaves the text unchanged — there is no
local fallback.
"""

import logging
import os

logger = logging.getLogger(__name__)

_endpoint: str | None = None
_client = None  # injectable httpx client (tests); else a per-call request


def set_endpoint(url: str | None) -> None:
    global _endpoint
    _endpoint = url


def set_client(client) -> None:
    """Inject an httpx client (used by tests to point at an in-process server)."""
    global _client
    _client = client


def get_endpoint() -> str | None:
    return _endpoint or os.getenv("TS_COMPRESS_URL")


def compress(text: str, *, rate: float, model: str, timeout: float = 30.0) -> dict | None:
    """POST to the compression service. Returns its JSON, or None if unconfigured/unreachable."""
    endpoint = get_endpoint()
    if not endpoint:
        return None
    url = endpoint.rstrip("/") + "/v1/compress"
    payload = {"text": text, "rate": rate, "model": model}
    try:
        if _client is not None:
            resp = _client.post(url, json=payload)
        else:
            import httpx

            resp = httpx.post(url, json=payload, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.debug("compression service unavailable at %s; leaving text unchanged", url)
        return None
