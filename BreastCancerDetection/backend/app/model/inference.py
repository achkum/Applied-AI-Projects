import io
import json
import logging
import os
import tempfile
import uuid

import torch
from PIL import Image
from torchvision import transforms

from app.config import settings
from app.model.architecture import ResNet50CancerModel
from app.schemas import ClassificationResult, TriageTier

logger = logging.getLogger(__name__)

# These must match the training pipeline exactly (copied from the M7016H notebook).
CLASS_NAMES = ["benign", "malignant"]
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
INPUT_SIZE = 299

EVAL_TRANSFORM = transforms.Compose(
    [
        transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
    ]
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Set True once real trained weights are loaded; the eval gate skips on an untrained model.
WEIGHTS_LOADED = False


def download_from_gcs(uri: str) -> str:
    """Download the weights (and a model_metadata.json sibling, if present) from GCS.
    Used in Cloud Run, where Application Default Credentials are available."""
    from google.cloud import storage

    bucket_name, _, blob_name = uri.removeprefix("gs://").partition("/")
    dest_dir = os.path.join(tempfile.gettempdir(), "cdss-model")
    os.makedirs(dest_dir, exist_ok=True)

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    local_path = os.path.join(dest_dir, os.path.basename(blob_name))
    bucket.blob(blob_name).download_to_filename(local_path)

    meta_blob = bucket.blob(f"{os.path.dirname(blob_name)}/model_metadata.json")
    if meta_blob.exists():
        meta_blob.download_to_filename(os.path.join(dest_dir, "model_metadata.json"))

    logger.info("Downloaded weights from %s", uri)
    return local_path


def resolve_weights_path() -> str | None:
    """A local MODEL_PATH wins; otherwise download from MODEL_GCS_URI if configured."""
    if settings.model_path and os.path.exists(settings.model_path):
        return settings.model_path
    if settings.model_gcs_uri:
        try:
            return download_from_gcs(settings.model_gcs_uri)
        except Exception:
            logger.exception("Failed to download weights from %s", settings.model_gcs_uri)
    return settings.model_path


def load_metadata(weights_path: str) -> dict:
    """Read the model_metadata.json sidecar shipped next to the weights, if present."""
    meta_path = os.path.join(os.path.dirname(weights_path), "model_metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            return json.load(f)
    return {}


def load_model() -> tuple[ResNet50CancerModel, float]:
    """Build the architecture and load trained weights once. Falls back to an untrained
    model (with a loud warning) when no weights are available, so the app still runs."""
    global WEIGHTS_LOADED
    model = ResNet50CancerModel(pretrained=False)
    threshold = settings.decision_threshold

    weights_path = resolve_weights_path()
    if weights_path and os.path.exists(weights_path):
        state_dict = torch.load(weights_path, map_location=DEVICE)
        model.load_state_dict(state_dict)
        WEIGHTS_LOADED = True
        meta = load_metadata(weights_path)
        if "threshold" in meta:
            threshold = float(meta["threshold"])
        logger.info(
            "Loaded model weights from %s (threshold=%.4f, val_auc=%s)",
            weights_path,
            threshold,
            meta.get("val_auc", "n/a"),
        )
    else:
        logger.warning(
            "No model weights found (MODEL_PATH=%r). Serving an UNTRAINED model — "
            "predictions are NOT meaningful. Set MODEL_PATH to a trained .pth.",
            weights_path,
        )

    model.to(DEVICE).eval()
    return model, threshold


MODEL, ACTIVE_THRESHOLD = load_model()


def load_image(image_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def probability_malignant(image: Image.Image) -> float:
    """Run the model and return P(malignant) for a single image."""
    tensor = EVAL_TRANSFORM(image).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        logit = MODEL(tensor).squeeze(1)
        return torch.sigmoid(logit).item()


def triage_tier(prob: float, threshold: float, margin: float) -> TriageTier:
    """CDSS triage band (from the notebook): defer the uncertain middle to a pathologist."""
    if prob < threshold - margin:
        return "confident_benign"
    if prob > threshold + margin:
        return "confident_malignant"
    return "uncertain_review"


def predict(image_bytes: bytes) -> ClassificationResult:
    """Classify a histopathology slide. Synchronous/CPU-bound — call via asyncio.to_thread."""
    image = load_image(image_bytes)
    prob = probability_malignant(image)
    is_malignant = prob > ACTIVE_THRESHOLD
    confidence = prob if is_malignant else 1.0 - prob
    return ClassificationResult(
        predicted_class=CLASS_NAMES[1] if is_malignant else CLASS_NAMES[0],
        confidence=round(confidence, 4),
        probability_malignant=round(prob, 4),
        tier=triage_tier(prob, ACTIVE_THRESHOLD, settings.uncertainty_margin),
        prediction_id=str(uuid.uuid4()),
    )
