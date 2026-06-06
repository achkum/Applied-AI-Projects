# Python / Backend Conventions

Project: FastAPI backend serving ResNet50 inference, Grad-CAM, an MCP server, and an agent loop.

## Versions and tooling

- Python 3.11+. Use 3.11+ features freely: `match` statements, `Self` type, etc.
- Use `uv` for dependency management. Declare dependencies in `pyproject.toml`. Do not use raw `pip` or `requirements.txt`.
- Linter: `ruff` (config in `pyproject.toml`). Run `uv run ruff check .` before considering work done.
- Type checker: not strict mypy, but type hints are required on all function signatures (return types optional only for `__init__`).

## Code style

- Type hints on all function signatures: `def predict(image_bytes: bytes) -> Prediction:`.
- Use `pydantic` v2 models for any structured data crossing a function boundary (HTTP requests, MCP tool inputs/outputs, agent loop messages). Do not pass `dict` around.
- Async by default for I/O-bound work (route handlers, HTTP calls, file I/O).
- Synchronous is fine for CPU-bound work (model inference, image preprocessing) — wrap with `asyncio.to_thread` when called from an async context.
- No elaborate docstrings. Short one-liners only where the function name isn't obvious. This is an application, not a library.
- Do not prefix helpers with `_`. Use plain names; module structure handles visibility.

## File organization

```
backend/app/
├── main.py             # FastAPI app + route registration only
├── routes/             # Route handlers (thin — delegate to other modules)
│   ├── predict.py
│   ├── gradcam.py
│   └── chat.py
├── model/              # ML inference logic
│   ├── inference.py    # ResNet50 wrap + preprocessing
│   └── gradcam.py
├── mcp_server/         # MCP server + tool implementations
│   ├── server.py
│   └── tools.py
├── agent/              # LLM agent loop
│   ├── loop.py
│   └── prompt.py
└── schemas.py          # Shared pydantic models
```

Route handlers stay thin: parse input → call domain module → return response. Business logic lives in `model/`, `mcp_server/`, or `agent/` — not in the route file.

## FastAPI patterns

- Use `APIRouter` per route module; register them in `main.py`.
- Use `Depends()` only for genuinely shared cross-route concerns (none in v1).
- For errors: `raise HTTPException(...)` with a clean message. Do not return error dicts manually.
- Declare request/response models as pydantic in `schemas.py` and reference from route signatures so OpenAPI docs are accurate.
- CORS configured in `main.py` from the `ALLOWED_ORIGINS` env var (comma-separated).

## ML inference

- Load the model ONCE at module import in `model/inference.py`; hold at module scope.
- Never reload weights on every request.
- Preprocessing must match the training pipeline exactly — copy from the M7016H notebook verbatim.
- Inference runs synchronously; wrap calls from async routes with `asyncio.to_thread`.

## Testing

- `pytest` for everything.
- Test fixtures (small BreaKHis images with known labels) live in `backend/tests/fixtures/`.
- Do NOT mock the model in eval-gate tests — those run the real model and assert AUC > 0.85.
- DO mock the Gemini API in agent-loop tests using `pytest-httpx` or similar.
- Test naming: `test_<module>.py`, with test names like `test_<function>_<scenario>`.

## Logging and observability

- Use the stdlib `logging` module configured in `main.py`. Structured JSON logs in production.
- Never log secret values (API keys), raw image bytes, or anything that might contain PHI.
- For LLM calls: log model name, token counts, latency. Do not log full prompts or responses in production.

## Security and constraints

- No secrets in code. All API keys via environment variables only.
- No patient data persistence — see CLAUDE.md hard constraints.
- Validate image uploads: max 10 MB, must be PNG or JPEG MIME type, reject anything else with a 400.
