import base64
import io
import uuid

import numpy as np
from PIL import Image
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image

from app.model import inference
from app.schemas import HeatmapResult

# Last residual block is the standard Grad-CAM target for ResNet50.
TARGET_LAYERS = [inference.MODEL.backbone.layer4[-1]]


class MalignantScoreTarget:
    """Grad-CAM target: the single malignant logit. Highlights regions driving the
    model's malignancy score (the clinically relevant 'why')."""

    def __call__(self, model_output):
        return model_output[0]


def attention_summary(cam: np.ndarray) -> str:
    high_fraction = 100.0 * float((cam > 0.5).mean())
    h, w = cam.shape
    center = cam[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4]
    center_frac = float(center.sum()) / (float(cam.sum()) + 1e-8)
    location = "centrally" if center_frac > 0.6 else "diffusely across the field"
    return (
        f"The model's attention is concentrated {location}; "
        f"{high_fraction:.0f}% of the field shows high activation (Grad-CAM > 0.5). "
        "Highlighted regions are those driving the malignancy score."
    )


def generate(image_bytes: bytes, overlay_opacity: float = 0.5) -> HeatmapResult:
    """Produce a Grad-CAM overlay PNG (base64) + a textual attention summary.
    Synchronous/CPU-bound — call via asyncio.to_thread."""
    image = inference.load_image(image_bytes)
    tensor = inference.EVAL_TRANSFORM(image).unsqueeze(0).to(inference.DEVICE)

    with GradCAM(model=inference.MODEL, target_layers=TARGET_LAYERS) as cam:
        grayscale_cam = cam(input_tensor=tensor, targets=[MalignantScoreTarget()])[0]

    base = np.asarray(
        image.resize((inference.INPUT_SIZE, inference.INPUT_SIZE)), dtype=np.float32
    ) / 255.0
    overlay = show_cam_on_image(
        base, grayscale_cam, use_rgb=True, image_weight=1.0 - overlay_opacity
    )

    buf = io.BytesIO()
    Image.fromarray(overlay).save(buf, format="PNG")
    return HeatmapResult(
        heatmap_base64=base64.b64encode(buf.getvalue()).decode("ascii"),
        attention_summary=attention_summary(grayscale_cam),
        prediction_id=str(uuid.uuid4()),
    )
