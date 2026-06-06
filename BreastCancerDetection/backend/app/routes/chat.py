from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agent import loop
from app.schemas import ChatRequest

router = APIRouter()


@router.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    """Stream the agent's response as Server-Sent Events. Session state is in-memory only
    (carried in req.history); nothing is persisted."""
    return StreamingResponse(
        loop.run_agent(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
