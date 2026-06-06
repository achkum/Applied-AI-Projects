import numpy as np
from PIL import Image

# Reject inputs that don't look like H&E histopathology before running the model — otherwise the
# closed-set classifier returns a confident benign/malignant call on any image (a cat, a landscape).
#
# Thresholds calibrated on the BreaKHis 400X fixture set:
#   real H&E slides:   he_fraction 0.46-1.00 (median 0.996)
#   non-histopath OOD: green/blue/grayscale = 0.00, random noise = 0.28
# A purely colour-based gate cannot catch a deliberately pink non-tissue image; feature-space OOD
# (Mahalanobis / kNN on ResNet50 embeddings) is the next robustness layer.

HE_FRACTION_MIN = 0.40
COLORED_FRACTION_MIN = 0.05
SATURATION_MIN = 0.12
ANALYSIS_SIZE = 128


class NotHistopathologyError(Exception):
    """Raised when an input image does not look like an H&E histopathology slide."""

    def __init__(self, reason: str, he_fraction: float):
        super().__init__(reason)
        self.reason = reason
        self.he_fraction = he_fraction


def he_stain_profile(image: Image.Image) -> tuple[float, float]:
    """Return (he_fraction, colored_fraction): how much of the stained tissue sits in the
    H&E pink/purple hue band, and how much of the image is coloured at all."""
    img = image.convert("RGB").resize((ANALYSIS_SIZE, ANALYSIS_SIZE))
    hsv = np.asarray(img.convert("HSV"), dtype=np.float32)
    hue = hsv[..., 0] / 255.0 * 360.0
    sat = hsv[..., 1] / 255.0

    colored = sat > SATURATION_MIN
    colored_count = int(colored.sum())
    colored_fraction = colored_count / hue.size

    # Eosin (pink/red) + hematoxylin (purple), with a small red wrap-around.
    he_band = ((hue >= 260) & (hue <= 350)) | (hue <= 12)
    he_fraction = (int((he_band & colored).sum()) / colored_count) if colored_count else 0.0
    return he_fraction, colored_fraction


def assert_histopathology(image: Image.Image) -> None:
    he_fraction, colored_fraction = he_stain_profile(image)
    if colored_fraction < COLORED_FRACTION_MIN or he_fraction < HE_FRACTION_MIN:
        raise NotHistopathologyError(
            "The image does not appear to be an H&E breast histopathology slide (its stain-colour "
            "profile doesn't match). Prediction withheld — please upload a histopathology slide.",
            round(he_fraction, 3),
        )
