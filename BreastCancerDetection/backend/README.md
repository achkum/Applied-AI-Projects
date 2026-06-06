# Backend: Histopathology CDSS

FastAPI service: ResNet50 inference, Grad-CAM, an MCP server (two tools), and a Gemini agent.

## Run locally

```bash
cd backend
cp .env.example .env          # set MODEL_PATH and GEMINI_API_KEY (optional for /predict, /gradcam)
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000  (docs at /docs)
```

Without a `MODEL_PATH`, the service loads an **untrained** ResNet50 and logs a loud warning;
endpoints work but predictions are not meaningful. Point `MODEL_PATH` at the
`resnet50_breakhis_400x.pth` exported by the notebook (keep `model_metadata.json` next to it so the
operating threshold and preprocessing constants are picked up).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/predict` | multipart image → `{class, confidence, probability_malignant, tier, prediction_id}` |
| POST | `/gradcam` | `{image_base64, overlay_opacity}` → `{heatmap_base64, attention_summary, prediction_id}` |
| POST | `/chat` | `{session_id, message, history, image_base64}` → SSE stream of agent events |
| GET | `/mcp/sse` | MCP server (SSE) exposing `classify_histopath_image` and `generate_gradcam_heatmap` |
| GET | `/health` | liveness |

## Quality

```bash
uv run ruff check .
uv run pytest            # unit tests (Gemini mocked, model runs untrained)
docker build -t cdss-backend .
```

The eval gate (`tests/test_eval_gate.py`) runs the **real** model over labelled fixtures and asserts
`AUC > 0.85`. It skips unless trained weights are loaded and `EVAL_FIXTURES_DIR` is set; CI supplies
both (see the repo-root `.github/workflows/cdss-eval-gate.yml`).
