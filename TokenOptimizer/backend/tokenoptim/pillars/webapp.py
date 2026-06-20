"""Hosted engine demo (Cloud Run) — the optimization engine exposed WITHOUT any API key.

This is the secret-free half of the system: it normalizes, compresses, counts, and cache-rewrites
payloads, but it never forwards to a provider, so it holds no credentials and is safe to host
publicly. (The key-forwarding proxy in ``tokenoptim.pillars.proxy`` stays local-only.) It also serves the
shared ``/v1/compress`` endpoint that the library, MCP server, and browser extension call.
"""

import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from tokenoptim.core.ledger import Ledger
from tokenoptim.core.tokens import count_tokens, provider_for
from tokenoptim.core.types import Change, OptimizationResult, OptimizerConfig
from tokenoptim.normalize.delta import DeltaStore
from tokenoptim.optimizer import optimize_payload

logger = logging.getLogger(__name__)

DEMO_MODELS = ["gpt-4o", "claude-sonnet-4-5", "gemini-1.5-pro", "mistral-large-latest"]


def _load_compressor():
    """Load the LLMLingua-2 model. A local TS_MODEL_DIR wins; otherwise download from TS_MODEL_GCS
    (Cloud Run). Returns None when neither is available — the service then leaves text unchanged."""
    model_dir = os.getenv("TS_MODEL_DIR")
    gcs = os.getenv("TS_MODEL_GCS")
    if not model_dir and gcs:
        try:
            from tokenoptim.compress.llmlingua import fetch_from_gcs

            model_dir = str(fetch_from_gcs(gcs, "/tmp/token-optimizer-model"))
        except Exception:
            logger.exception("failed to download compression model from %s", gcs)
            return None
    if not model_dir:
        return None
    d = Path(model_dir)
    if not (d / "model.int8.onnx").exists() and not (d / "model.onnx").exists():
        return None
    try:
        from tokenoptim.compress.llmlingua import LLMLingua2

        return LLMLingua2(d)
    except Exception:
        logger.exception("failed to load compression model from %s", model_dir)
        return None


class CountRequest(BaseModel):
    text: str
    model: str = "gpt-4o"


class CompressRequest(BaseModel):
    text: str
    model: str = "gpt-4o"


class OptimizeRequest(BaseModel):
    payload: dict
    model: str = "gpt-4o"


class CompressV1Request(BaseModel):
    text: str
    rate: float = 0.6  # fraction of words the model keeps
    model: str = "gpt-4o"


def _result_dict(r) -> dict:
    return {
        "feature": r.feature,
        "tokens_before": r.tokens_before,
        "tokens_after": r.tokens_after,
        "tokens_saved": r.tokens_saved,
        "changes": [c.description for c in r.changes],
    }


def app_factory() -> FastAPI:
    app = FastAPI(title="token-optimizer engine demo")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.ledger = Ledger()
    app.state.delta_store = DeltaStore()
    app.state.compressor = _load_compressor()  # learned model when TS_MODEL_DIR/TS_MODEL_GCS is set

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok", "model_loaded": app.state.compressor is not None}

    def run_model_compression(text: str, rate: float, model: str):
        """Compress with the loaded model, or leave the text unchanged when none is loaded (there
        is no local fallback). Records the result to the ledger; returns (text, before, after, mode)."""
        before = count_tokens(text, model).count
        compressor = app.state.compressor
        if compressor is not None:
            out = compressor.compress(text, rate=rate)["text"]
            mode = "model"
        else:
            out = text
            mode = "none"
        after = count_tokens(out, model).count
        app.state.ledger.record(
            OptimizationResult(
                feature="compression",
                tokens_before=before,
                tokens_after=after,
                changes=[Change("compress", f"compressed via {mode}", before - after)],
            )
        )
        return out, before, after, mode

    @app.post("/v1/compress")
    async def v1_compress(req: CompressV1Request) -> JSONResponse:
        """The canonical compression endpoint every client (library, MCP, extension) calls. Uses
        the loaded model; if none is loaded, returns the text unchanged with ``mode="none"``."""
        text, before, after, mode = run_model_compression(req.text, req.rate, req.model)
        return JSONResponse(
            {"text": text, "tokens_before": before, "tokens_after": after, "mode": mode}
        )

    @app.post("/api/count")
    async def api_count(req: CountRequest) -> JSONResponse:
        tc = count_tokens(req.text, req.model)
        return JSONResponse(
            {"count": tc.count, "exact": tc.exact, "provider": provider_for(req.model).value}
        )

    @app.post("/api/compress")
    async def api_compress(req: CompressRequest) -> JSONResponse:
        text, before, after, mode = run_model_compression(req.text, 0.6, req.model)
        return JSONResponse(
            {
                "text": text,
                "tokens_before": before,
                "tokens_after": after,
                "tokens_saved": before - after,
                "changes": [f"compressed via {mode}"],
            }
        )

    @app.post("/api/optimize")
    async def api_optimize(req: OptimizeRequest) -> JSONResponse:
        cfg = OptimizerConfig(model=req.model, provider=provider_for(req.model))
        optimized, results = optimize_payload(
            dict(req.payload), cfg, app.state.ledger, app.state.delta_store, "demo"
        )
        app.state.ledger.record_call([])
        total = sum(r.tokens_saved for r in results)
        return JSONResponse(
            {"payload": optimized, "results": [_result_dict(r) for r in results], "tokens_saved": total}
        )

    @app.get("/stats")
    async def stats() -> JSONResponse:
        return JSONResponse(app.state.ledger.totals())

    @app.get("/", response_class=HTMLResponse)
    async def index() -> HTMLResponse:
        return HTMLResponse(_DEMO_HTML)

    return app


_DEMO_HTML = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Token Optimizer — engine demo</title>
<style>
 :root { color-scheme: light dark; }
 body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 760px; margin: 2.5rem auto; padding: 0 1rem; line-height: 1.5; }
 h1 { font-size: 1.3rem; } .sub { opacity: .7; margin-top: -.5rem; }
 textarea { width: 100%; min-height: 160px; font: 14px ui-monospace, monospace; padding: .6rem; border-radius: 8px; border: 1px solid rgba(128,128,128,.4); box-sizing: border-box; }
 .row { display: flex; gap: .75rem; align-items: center; margin: .75rem 0; flex-wrap: wrap; }
 button { font: inherit; padding: .45rem 1rem; border-radius: 8px; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; }
 select, label { font: inherit; }
 .hero { font-size: 2rem; font-weight: 700; }
 .hero small { font-size: 1rem; font-weight: 400; opacity: .6; }
 pre { white-space: pre-wrap; word-break: break-word; background: rgba(128,128,128,.12); padding: .75rem; border-radius: 8px; }
 .changes { font-size: .85rem; opacity: .8; }
</style></head><body>
 <h1>Token Optimizer — engine demo</h1>
 <p class="sub">Prompt compression with the LLMLingua-2 model. Nothing is sent to any LLM provider — this runs the engine only.</p>
 <textarea id="in" placeholder="Paste a verbose prompt…">Hi there! I was wondering if you could please help me out. In order to improve performance, due to the fact that the current code re-reads the config on every single request, we should add caching. Thanks in advance!</textarea>
 <div class="row">
   <label>Model <select id="model"></select></label>
   <button id="go">Compress</button>
 </div>
 <div class="hero" id="hero">— <small>tokens saved</small></div>
 <pre id="out"></pre>
 <div class="changes" id="changes"></div>
<script>
 const MODELS = %MODELS%;
 const sel = document.getElementById('model');
 MODELS.forEach(m => { const o = document.createElement('option'); o.value = o.textContent = m; sel.appendChild(o); });
 document.getElementById('go').onclick = async () => {
   const body = { text: document.getElementById('in').value, model: sel.value };
   const r = await fetch('/api/compress', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
   const d = await r.json();
   const saved = d.tokens_before - d.tokens_after;
   const pct = d.tokens_before ? Math.round(saved / d.tokens_before * 100) : 0;
   document.getElementById('hero').innerHTML = saved + ' <small>tokens saved (' + d.tokens_before + ' → ' + d.tokens_after + ', ' + pct + '%)</small>';
   document.getElementById('out').textContent = d.text;
   document.getElementById('changes').textContent = (d.changes || []).join(' · ');
 };
</script>
</body></html>""".replace("%MODELS%", str(DEMO_MODELS))


app = app_factory()
