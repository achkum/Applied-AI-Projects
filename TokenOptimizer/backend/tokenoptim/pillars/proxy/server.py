"""Transparent proxy with the optimization engine wired inline — multi-provider.

Routing: the target provider is resolved from the request's ``model`` (the reliable signal among
the many OpenAI-compatible providers that share ``/v1/chat/completions``) or, failing that, from
the request path (Anthropic ``/v1/messages``, Gemini ``/v1beta/models/…``). Each provider's
upstream is its ``TS_<PROVIDER>_UPSTREAM`` env override or its real API.

Every POST is optimized (normalization → cache → optional compression → response budgeting) for
the schemas we handle, and forwarded untouched otherwise — a request is never broken. Streaming
is byte-exact passthrough with retries only before the first downstream byte.

Savings honesty: cache savings are **measured** from each response's ``usage`` (cached input
tokens × the provider's cache discount), not guessed at request time. We do NOT credit output
savings — capping output is real but the counterfactual ("what length would it have been?") is
unmeasurable without a control, so we don't fabricate it. API keys pass through and are never
stored (the session id is a hash prefix of the auth header).
"""

import asyncio
import hashlib
import json
import logging
import os
import re
from dataclasses import replace
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse

from tokenoptim.core.ledger import Ledger
from tokenoptim.core.providers import resolve, resolve_by_path
from tokenoptim.core.providers.base import ProviderAdapter
from tokenoptim.core.types import Change, OptimizationResult, OptimizerConfig, Provider
from tokenoptim.normalize.delta import DeltaStore
from tokenoptim.optimizer import optimize_payload
from tokenoptim.pillars.proxy.stats_page import render_stats_html

logger = logging.getLogger(__name__)

_HOP_BY_HOP = {
    "host", "content-length", "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade",
}
_RESP_DROP = {"content-length", "transfer-encoding", "content-encoding", "connection"}

BACKOFFS = (0.5, 1.0)
_MAX_RETRIES = 2
_STREAM_SNIFF_CAP = 2_000_000  # bytes of a stream we copy (not buffer) to read usage

# Cache-read token fields across providers (for sniffing streamed usage without parsing SSE).
_CACHE_READ_RE = re.compile(
    r'"(?:cache_read_input_tokens|cached_tokens|prompt_cache_hit_tokens|cachedContentTokenCount)"'
    r"\s*:\s*(\d+)"
)

# --------------------------------------------------------------------------- helpers

def parse_body(body: bytes) -> dict | None:
    """Parse a request body once. Returns the dict, or None if it isn't a JSON object."""
    try:
        parsed = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def filter_request_headers(headers, *, disable_compression: bool = False) -> dict[str, str]:
    out = {k: v for k, v in headers.items() if k.lower() not in _HOP_BY_HOP}
    if disable_compression:
        out["accept-encoding"] = "identity"
    return out


def filter_response_headers(headers) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in _RESP_DROP}


def session_id(request: Request) -> str:
    auth = request.headers.get("authorization") or request.headers.get("x-api-key") or ""
    return hashlib.sha256(auth.encode("utf-8")).hexdigest()[:12] if auth else "anon"


def route(request: Request, parsed: dict | None) -> tuple[ProviderAdapter, str, Provider]:
    """Resolve (adapter, upstream_url, schema_family) from the parsed body / request path."""
    model = parsed.get("model") if isinstance(parsed, dict) else None
    adapter = resolve(model) if isinstance(model, str) else (resolve_by_path(request.url.path) or resolve(""))
    upstream = os.getenv(adapter.upstream_env, adapter.default_base_url)
    family = Provider.ANTHROPIC if adapter.name == "anthropic" else Provider.OPENAI
    return adapter, upstream, family


def _build_config(payload: dict, family: Provider, base: OptimizerConfig) -> OptimizerConfig:
    model = payload.get("model") if isinstance(payload.get("model"), str) else base.model
    return replace(base, model=model, provider=family)


def optimize_request(
    parsed: dict | None, request: Request, family: Provider
) -> tuple[bytes | None, list[OptimizationResult]]:
    """Optimize an already-parsed request body. Returns (new_body or None, results)."""
    if not isinstance(parsed, dict):
        return None, []
    app = request.app
    cfg = _build_config(parsed, family, app.state.config)
    payload, results = optimize_payload(
        parsed, cfg, app.state.ledger, app.state.delta_store, session_id(request)
    )
    app.state.ledger.record_call([])  # bump call counter once; features recorded their own savings
    return json.dumps(payload).encode("utf-8"), results


def _log_results(app: FastAPI, results: list[OptimizationResult]) -> None:
    if not results:
        return
    log_dir = Path(os.getenv("TS_LOG_DIR", str(Path.home() / ".token-optimizer")))
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        line = json.dumps(
            [
                {
                    "feature": r.feature,
                    "tokens_before": r.tokens_before,
                    "tokens_after": r.tokens_after,
                    "tokens_saved": r.tokens_saved,
                    "changes": [c.kind for c in r.changes],
                }
                for r in results
            ]
        )
        with (log_dir / "log.jsonl").open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        logger.debug("could not write savings log", exc_info=True)


def _credit_cache(app: FastAPI, adapter: ProviderAdapter, model: str, cache_read: int | None) -> None:
    """Record MEASURED cache savings: cached input tokens billed at the provider's reduced rate."""
    if not isinstance(cache_read, int) or cache_read <= 0:
        return
    policy = adapter.cache_policy(model)
    saved = round(cache_read * policy.discount)
    if saved <= 0:
        return
    app.state.ledger.record(
        OptimizationResult(
            feature="cache_optimization",
            tokens_before=cache_read,
            tokens_after=cache_read - saved,
            changes=[
                Change(
                    "measured_cache_read",
                    f"{cache_read} cached input tokens billed at "
                    f"{round((1 - policy.discount) * 100)}% (saved {saved})",
                    saved,
                )
            ],
        )
    )


def _measure_cache_nonstream(app, adapter, model, content: bytes) -> None:
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, ValueError):
        return
    if not isinstance(data, dict):
        return
    usage = data.get("usage") or data.get("usageMetadata") or {}
    if isinstance(usage, dict):
        _credit_cache(app, adapter, model, adapter.usage_cache_read_tokens(usage))


def _measure_cache_stream(app, adapter, model, text: str) -> None:
    matches = [int(m) for m in _CACHE_READ_RE.findall(text)]
    if matches:
        _credit_cache(app, adapter, model, max(matches))


# --------------------------------------------------------------------------- forwarding

async def _establish(client, method, url, body, headers, params) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            req = client.build_request(method, url, content=body, headers=headers, params=params)
            resp = await client.send(req, stream=True)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(BACKOFFS[attempt])
                continue
            raise
        if resp.status_code >= 500 and attempt < _MAX_RETRIES:
            await resp.aclose()
            await asyncio.sleep(BACKOFFS[attempt])
            continue
        return resp
    raise last_exc  # pragma: no cover


async def _forward(request: Request) -> Response:
    body = await request.body()
    parsed = parse_body(body)  # parse once; route/optimize/stream-detect all reuse it
    adapter, upstream_base, family = route(request, parsed)
    model = (parsed.get("model") if isinstance(parsed, dict) else None) or request.app.state.config.model
    streaming = isinstance(parsed, dict) and parsed.get("stream") is True

    optimized, results = optimize_request(parsed, request, family)
    forward_body = optimized if optimized is not None else body

    client: httpx.AsyncClient = request.app.state.client
    url = upstream_base.rstrip("/") + request.url.path
    headers = filter_request_headers(request.headers, disable_compression=streaming)
    params = dict(request.query_params)

    try:
        upstream = await _establish(client, request.method, url, forward_body, headers, params)
    except (httpx.ConnectError, httpx.ConnectTimeout):
        return JSONResponse({"error": "Upstream connection failed."}, status_code=502)

    app = request.app
    if not streaming:
        content = await upstream.aread()
        await upstream.aclose()
        _measure_cache_nonstream(app, adapter, model, content)
        _log_results(app, results)
        return Response(
            content=content,
            status_code=upstream.status_code,
            headers=filter_response_headers(upstream.headers),
        )

    _log_results(app, results)
    sniff: list[bytes] = []
    sniffed = 0

    async def body_iter():
        nonlocal sniffed
        capped = False
        try:
            async for chunk in upstream.aiter_raw():
                if sniffed < _STREAM_SNIFF_CAP:
                    sniff.append(chunk)
                    sniffed += len(chunk)
                elif not capped:
                    capped = True
                    logger.debug(
                        "stream exceeded %d-byte usage-sniff cap; cache savings may be undercounted",
                        _STREAM_SNIFF_CAP,
                    )
                yield chunk
        except Exception:
            return
        finally:
            await upstream.aclose()
            if sniff:
                try:
                    _measure_cache_stream(app, adapter, model, b"".join(sniff).decode("utf-8", "replace"))
                except Exception:
                    logger.debug("stream usage sniff failed", exc_info=True)

    return StreamingResponse(
        body_iter(),
        status_code=upstream.status_code,
        headers=filter_response_headers(upstream.headers),
        media_type="text/event-stream",
    )


# --------------------------------------------------------------------------- app

def app_factory(config: OptimizerConfig | None = None) -> FastAPI:
    """Build the proxy app. Upstreams are resolved per-provider from the environment at call time."""
    app = FastAPI(title="token-optimizer proxy")
    app.state.client = httpx.AsyncClient(timeout=600.0)
    app.state.config = config or OptimizerConfig()
    app.state.ledger = Ledger()
    app.state.delta_store = DeltaStore()

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/stats")
    async def stats(request: Request) -> JSONResponse:
        return JSONResponse(request.app.state.ledger.totals())

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request) -> HTMLResponse:
        return HTMLResponse(render_stats_html(request.app.state.ledger.totals()))

    # One catch-all POST: routing is by model/path, covering every supported provider.
    @app.post("/{full_path:path}")
    async def proxy(request: Request, full_path: str) -> Response:
        return await _forward(request)

    return app


app = app_factory()
