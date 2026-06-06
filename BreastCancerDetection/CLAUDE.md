# Breast Cancer Histopathology — Clinical Decision Support App

An end-to-end clinical decision support web app: a pathologist uploads a breast histopathology slide and receives an AI-assisted prediction (ResNet50) with explainability (Grad-CAM), plus a conversational agent that uses MCP tools for follow-up questions.

This is a portfolio piece, built on top of the existing ResNet50 classifier from M7016H (Luleå University). No retraining happens in this repo — the model is an input artifact.

## User persona

A pathologist (or trained medical professional with biopsy histopath imagery) who wants AI-assisted decision support for benign-vs-malignant classification.

## Goals (in scope for v1)

- End-to-end app: Next.js frontend → FastAPI backend → existing ResNet50 model.
- MCP server with two tools (`classify_histopath_image`, `generate_gradcam_heatmap`) — reusable by the in-app agent and external clients.
- In-app conversational agent (Gemini 2.5 Flash via Google AI Studio) that uses the MCP tools to answer pathologist follow-ups.
- Deployed on GCP Cloud Run + GCS + Artifact Registry; frontend on Vercel.
- GitHub Actions CI with lint, tests, and a model eval gate.
- Public live demo URL recruiters can click.

## Non-goals (do NOT add these without explicit user approval)

- Patient data persistence (PHI handling requires GDPR/HIPAA-grade compliance, intentionally out of v1).
- Authentication or multi-user (single-session demo).
- Model retraining or new architectures (we reuse the existing weights).
- Multi-agent orchestration (one agent with multiple tools is sufficient).
- Vertex AI Endpoint serving (cost-prohibitive; Cloud Run gives the cloud signal at $0).
- RAG over pathology literature (forced fit for this use case).
- Mobile-responsive design beyond Tailwind defaults.

## Hard constraints

- **No PHI persistence.** No database, no patient data stored anywhere. Session state is in-memory only.
- **No diagnoses.** Outputs are decision support, never diagnoses. Disclaimer visible on every screen.
- **No model retraining.** ResNet50 weights are an input artifact loaded from GCS at startup.
- **No training data in the repo.** BreaKHis is licensed; only the 4 demo slides in `frontend/public/examples/`.
- **No secrets in code.** API keys via environment variables only. Never log secret values.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 + Tailwind CSS, hosted on Vercel |
| Backend | FastAPI + Uvicorn, hosted on GCP Cloud Run |
| ML model | ResNet50 (existing BreaKHis 400X weights) |
| Explainability | `pytorch-grad-cam` |
| MCP | Anthropic official `mcp` Python SDK, SSE transport |
| LLM (agent) | Gemini 2.5 Flash via Google AI Studio (free tier) |
| Model storage | Google Cloud Storage |
| Container registry | Artifact Registry |
| CI/CD | GitHub Actions |

## Repo structure

```
breast-cancer-cdss/
├── frontend/                      # Next.js app
│   ├── app/
│   │   ├── page.tsx               # Landing
│   │   ├── analyze/page.tsx       # Main analysis view
│   │   └── layout.tsx
│   ├── components/
│   │   ├── UploadSlide.tsx
│   │   ├── PredictionCard.tsx
│   │   ├── HeatmapToggle.tsx
│   │   ├── ChatPanel.tsx
│   │   └── Disclaimer.tsx
│   ├── lib/{api.ts, types.ts}
│   └── public/examples/           # 4 preset demo slides
├── backend/                       # FastAPI app
│   ├── app/
│   │   ├── main.py                # FastAPI + route registration
│   │   ├── routes/{predict,gradcam,chat}.py
│   │   ├── model/{inference,gradcam}.py
│   │   ├── mcp_server/{server,tools}.py
│   │   ├── agent/{loop,prompt}.py
│   │   └── schemas.py
│   ├── tests/{fixtures/, test_*.py}
│   ├── Dockerfile
│   └── pyproject.toml
├── examples/external_agent_demo.py
├── .github/workflows/{lint-test,eval-gate,deploy}.yml
├── CLAUDE.md
├── README.md
└── .claude/{agents/, rules/}
```

## API surface

### REST endpoints
- `POST /predict` — multipart image upload → `{class, confidence, prediction_id}`.
- `POST /gradcam` — `{image_base64, overlay_opacity}` → base64 PNG heatmap + attention summary.
- `POST /chat` — `{session_id, message, history}` → SSE stream of agent response.
- `GET /mcp/sse` — MCP server SSE endpoint for external agents.

### MCP tools
- `classify_histopath_image(image_base64: str) -> ClassificationResult`
- `generate_gradcam_heatmap(image_base64: str, overlay_opacity: float = 0.5) -> HeatmapResult`

Both tools delegate to the same domain modules as the REST handlers — never duplicate logic between them.

## Commands

### Backend

```bash
cd backend
uv sync                              # install deps
uv run uvicorn app.main:app --reload # local dev on :8000
uv run pytest                        # tests
uv run ruff check .                  # lint
docker build -t cdss-backend .       # container
```

### Frontend

```bash
cd frontend
pnpm install
pnpm dev                             # local dev on :3000
pnpm test                            # jest
pnpm lint                            # eslint
```

### Deployment

- Frontend: Vercel auto-deploys on push to `main`.
- Backend: `.github/workflows/deploy.yml` builds, pushes to Artifact Registry, deploys to Cloud Run.
- Model weights: live in `gs://<project>-models/resnet50_breakhis_400x.pth`.

## Build plan (1 week, vibecoded)

- **Day 1 — Backend foundation.** Bootstrap FastAPI; extract inference into `backend/app/model/inference.py`; implement `/predict`; Dockerfile; local Docker build.
- **Day 2 — Explainability + MCP.** Integrate `pytorch-grad-cam`; implement `/gradcam`; stand up the MCP server with both tools; write `examples/external_agent_demo.py`.
- **Day 3 — Agent layer.** Gemini API client; agent loop in `backend/app/agent/loop.py`; `/chat` SSE endpoint; system prompt.
- **Day 4 — Frontend foundation.** Bootstrap Next.js + Tailwind; build `UploadSlide` (with 4 preset examples), `PredictionCard`, `HeatmapToggle`; wire to local backend.
- **Day 5 — Chat UI + polish.** `ChatPanel` with Vercel AI SDK SSE; `Disclaimer` everywhere; visual polish using the medical palette.
- **Day 6 — Deployment + CI.** GCP project setup, Artifact Registry, Cloud Run, GCS bucket; upload weights; three GitHub Actions workflows; deploy backend; verify Vercel frontend talks to deployed backend.
- **Day 7 — Docs + recruiter polish.** Polish README; record 2-min Loom walkthrough; final QA pass.

## Agent workflow

Three subagents in `.claude/agents/`:

- **developer** — Writes code. Invoked for any implementation task.
- **verifier** — Runs the app and the test suite. Validates user flows end-to-end.
- **reviewer** — Reads diffs and flags issues. Read-only.

For non-trivial work: developer implements → verifier checks it runs → reviewer reads the diff.

## Key entry points

- `backend/app/main.py` — FastAPI app + route registration.
- `backend/app/mcp_server/server.py` — MCP server setup.
- `backend/app/agent/loop.py` — Gemini agent + MCP tool dispatch.
- `frontend/app/analyze/page.tsx` — main analysis view.
- `examples/external_agent_demo.py` — external MCP client demo.

## Imports (auto-loaded by Claude Code)

@./.claude/rules/python-conventions.md
@./.claude/rules/typescript-conventions.md
@./.claude/rules/mcp-server.md
