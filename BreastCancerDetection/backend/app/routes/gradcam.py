import asyncio
import base64
import binascii

from fastapi import APIRouter, HTTPException

from app.model import gradcam
from app.model.input_gate import NotHistopathologyError
from app.schemas import GradcamRequest, HeatmapResult

router = APIRouter()


@router.post("/gradcam", response_model=HeatmapResult)
async def gradcam_heatmap(req: GradcamRequest) -> HeatmapResult:
    try:
        image_bytes = base64.b64decode(req.image_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="image_base64 is not valid base64.") from exc
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image.")

    opacity = min(max(req.overlay_opacity, 0.0), 1.0)
    try:
        return await asyncio.to_thread(gradcam.generate, image_bytes, opacity)
    except NotHistopathologyError as exc:
        raise HTTPException(status_code=422, detail=exc.reason) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not process the image.") from exc
