import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import settings
from app.model import inference
from app.model.input_gate import NotHistopathologyError
from app.schemas import ClassificationResult

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg"}


@router.post("/predict", response_model=ClassificationResult)
async def predict_slide(file: UploadFile = File(...)) -> ClassificationResult:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG or JPEG images are accepted.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file.")
    if len(image_bytes) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400, detail=f"Image exceeds the {settings.max_upload_mb} MB limit."
        )

    try:
        return await asyncio.to_thread(inference.predict, image_bytes)
    except NotHistopathologyError as exc:
        raise HTTPException(status_code=422, detail=exc.reason) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read the uploaded image.") from exc
