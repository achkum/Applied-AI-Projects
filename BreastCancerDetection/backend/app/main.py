import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.mcp_server.server import mcp
from app.routes import chat, gradcam, predict

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(
    title="Breast Cancer Histopathology CDSS",
    description="AI-assisted decision support for breast histopathology. Not a diagnostic device.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict.router)
app.include_router(gradcam.router)
app.include_router(chat.router)

# MCP server over SSE. sse_app() exposes /sse and /messages/; mounting at /mcp gives /mcp/sse.
# Don't pass mount_path here: the Starlette mount already supplies the /mcp prefix via root_path,
# so the transport advertises the correct /mcp/messages/ endpoint (passing it would double it).
app.mount("/mcp", mcp.sse_app())


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
