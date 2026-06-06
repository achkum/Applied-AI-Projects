import asyncio
import base64

from app.mcp_server.server import mcp
from app.model import gradcam, inference
from app.schemas import ClassificationResult, HeatmapResult


@mcp.tool()
async def classify_histopath_image(image_base64: str) -> ClassificationResult:
    """Classify a breast histopathology slide as benign or malignant.

    Use this when the user asks for the model's prediction on a slide. Returns the predicted
    class, the model's confidence, the malignant probability, a clinical triage tier
    (confident_benign / uncertain_review / confident_malignant), and a prediction ID.
    """
    image_bytes = base64.b64decode(image_base64)
    return await asyncio.to_thread(inference.predict, image_bytes)


@mcp.tool()
async def generate_gradcam_heatmap(
    image_base64: str, overlay_opacity: float = 0.5
) -> HeatmapResult:
    """Generate a Grad-CAM heatmap showing which regions of a breast histopathology slide drove
    the model's malignancy score.

    Use this when the user asks why the model reached its prediction or which areas look
    suspicious. Returns a base64-encoded PNG overlay and a short textual attention summary.
    overlay_opacity (0.0-1.0) controls how strongly the heatmap is blended over the slide.
    """
    image_bytes = base64.b64decode(image_base64)
    return await asyncio.to_thread(gradcam.generate, image_bytes, overlay_opacity)
