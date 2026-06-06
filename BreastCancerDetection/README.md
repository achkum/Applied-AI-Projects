# Breast Cancer Histopathology: Clinical Decision Support

A demo clinical decision support web app for breast cancer histopathology. A pathologist uploads a slide image; the app classifies it as benign or malignant using a ResNet50 model, visualizes which regions drove the prediction (Grad-CAM), and offers a conversational agent for follow-up questions via the Model Context Protocol (MCP).

> ⚠ **Research and educational prototype.** This tool does not provide medical diagnoses. AI predictions must be interpreted by a qualified pathologist alongside other clinical evidence. No patient data is stored.

## Live demo

**https://ai-breastcancer-detector.vercel.app/**

Frontend on Vercel; FastAPI backend on GCP Cloud Run (model weights served from GCS). The backend
may cold-start on the first request after idle, so give it a few seconds. A 2-minute walkthrough
script is in [docs/demo-script.md](./docs/demo-script.md).

## Highlights

- **MCP server**: Two tools (`classify_histopath_image`, `generate_gradcam_heatmap`) exposed as an MCP server. Usable by the in-app agent, by Claude Desktop, or by any other MCP-aware agent. One protocol, multiple consumers.
- **Agent layer**: In-app conversational assistant (Gemini 2.5 Flash) that calls the MCP tools to answer pathologist questions about predictions.
- **Explainability (XAI)**: Grad-CAM heatmaps show which regions of the slide drove the model's prediction, making explainability a first-class feature in a medical AI prototype.
- **Cloud-deployed**: FastAPI backend on GCP Cloud Run, model weights in GCS, container images in Artifact Registry. GitHub Actions CI includes an ML eval gate that catches model regressions before deployment.

## Architecture

```
┌──────────────┐    HTTPS / REST    ┌─────────────────────────────┐
│  Next.js UI  │ ─────────────────► │     FastAPI Backend         │
│   (Vercel)   │   /predict         │     (Cloud Run, GCP)        │
│              │   /gradcam         │                             │
│              │   /chat  (SSE)     │  ┌───────────────────────┐  │
└──────────────┘                    │  │ Agent Loop            │  │
                                    │  │  Gemini 2.5 Flash     │  │
                                    │  │  + MCP tools          │  │
                                    │  │                       │  │
                                    │  │ MCP Server (SSE)      │  │
                                    │  │  - classify_…         │  │
                                    │  │  - generate_gradcam_… │  │
                                    │  │                       │  │
                                    │  │ ResNet50 + Grad-CAM   │  │
                                    │  └───────────────────────┘  │
                                    └─────────────────────────────┘
                                              ▲ MCP over HTTP/SSE
                                              │
                                    ┌─────────┴─────────────┐
                                    │ External MCP clients  │
                                    │ (Claude Desktop,      │
                                    │  custom Python, etc.) │
                                    └───────────────────────┘
```

Key architectural points:

- The frontend never speaks MCP. MCP is a server-to-server agent protocol. The frontend speaks REST/SSE to the backend; the backend's agent speaks MCP internally.
- The MCP server is shared between the in-app agent and external clients. Same tools, two consumers.
- The ResNet50 model lives in-process in the backend. No separate model-serving endpoint.

## Stack

- **Frontend**: Next.js 14, Tailwind CSS (hosted on Vercel). Chat streaming uses a small SSE client
  in `lib/api.ts` (the backend emits a custom tool-aware event protocol the Vercel AI SDK hooks don't model).
- **Backend**: FastAPI, PyTorch (ResNet50), `pytorch-grad-cam`, Anthropic `mcp` Python SDK (hosted on GCP Cloud Run).
- **LLM**: Gemini 2.5 Flash via Google AI Studio (free tier).
- **Infra**: Google Cloud Storage (model weights), Artifact Registry (containers), GitHub Actions (CI/CD).

## Design decisions worth knowing

- **No RAG.** Pathology literature retrieval felt forced for the upload-and-classify flow. Replaced with Grad-CAM as the second MCP tool, which is more clinically relevant (explainability is near-standard in medical AI).
- **No Vertex AI.** Vertex AI Endpoints cost roughly $30-100/mo once trial credits expire. Cloud Run gives the GCP-experience signal while staying on the always-free tier.
- **No persistence.** Patient data handling requires HIPAA/GDPR-grade compliance. Intentionally out of v1 scope rather than half-built.
- **Gemini, not Claude or GPT.** Gemini 2.5 Flash has a real free tier via Google AI Studio with no credit card required; the others don't.

## Run locally

Requires Python 3.11+, Node 20+, Docker, and a Gemini API key (free tier at [aistudio.google.com](https://aistudio.google.com)).

```bash
# Backend
cd backend
cp .env.example .env  # then set GEMINI_API_KEY
uv sync
uv run uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). If `pnpm` isn't installed, enable it with
`corepack enable` (or run via `corepack pnpm <cmd>`).

**Model weights.** The classifier is an input artifact produced by the training notebook
(`BreastCancerDetector.ipynb` → "Final deployable model" section), which exports
`resnet50_breakhis_400x.pth`, `model_metadata.json`, the demo slides, and CI fixtures to
`results/deploy/`. Set `MODEL_PATH` (backend) to the `.pth`, drop the demo slides + `labels.json`
into `frontend/public/examples/`, and the eval fixtures where the eval gate can find them. Without
weights the backend runs an untrained fallback (predictions not meaningful) so the rest of the app
is still demoable.

## Use the MCP server externally

The MCP server is exposed at `/mcp/sse` on the backend. Two ways to use it:

**1. Custom Python client** (no Gemini key needed, it calls the tools directly):

```bash
pip install "mcp>=1.2" pillow
python examples/external_agent_demo.py [path/to/slide.png]   # backend must be running
```

**2. Claude Desktop**, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "histopath-cdss": {
      "transport": "sse",
      "url": "https://your-backend-url/mcp/sse"
    }
  }
}
```

Restart Claude Desktop; the two tools then become available in any conversation.

## Deployment configuration

Backend → Cloud Run, frontend → Vercel, weights → GCS, images → Artifact Registry, CI → GitHub
Actions. Because this lives in the `Applied-AI-Projects` monorepo, the workflows are at the
**repo root** `.github/workflows/` (`cdss-lint-test`, `cdss-eval-gate`, `cdss-deploy`), scoped to
`BreastCancerDetection/**`. `cdss-lint-test` runs with no secrets; `cdss-eval-gate` and
`cdss-deploy` stay dormant until you set the repo variable `GCP_ENABLED=true` plus the GCP
secrets/vars below.

**GCS layout** (`gs://<project>-models/`): `resnet50_breakhis_400x.pth`, `model_metadata.json`,
and a `fixtures/` folder (images + `labels.csv`) for the eval gate.

**GitHub secrets:** `GCP_SA_KEY` (service-account JSON), `GEMINI_API_KEY`.
**GitHub variables:** `GCP_PROJECT_ID`, `GCP_REGION`, `AR_REPOSITORY`, `CLOUD_RUN_SERVICE`,
`MODEL_GCS_URI`, `EVAL_FIXTURES_GCS_URI`, `ALLOWED_ORIGINS`.
**Vercel:** set `NEXT_PUBLIC_API_URL` to the Cloud Run URL; it auto-deploys on push to `main`.


## Roadmap (intentionally out of v1)

- Patient data persistence layer with proper PHI handling.
- Multi-user authentication.
- Vertex AI Endpoint for model serving (revisit when GCP credits are available).
- MLOps: drift detection, multi-model A/B testing, scheduled retraining.
- Mobile-responsive design.

## Why this project exists

A portfolio piece demonstrating end-to-end AI engineering on top of a real medical ML model: MCP server authoring, agent orchestration with tool use, explainability, cloud deployment, and CI/CD with model eval gates.

The classifier was originally trained for course M7016H (Artificial Intelligence within the Healthcare System) at Luleå University of Technology, on the BreaKHis breast histopathology dataset (400X magnification).

## License

MIT. See [LICENSE](./LICENSE).
