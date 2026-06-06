import pytest
from PIL import Image

from app.model.input_gate import NotHistopathologyError, assert_histopathology, he_stain_profile


def image_of(color: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", (64, 64), color=color)


def test_accepts_he_like_image():
    assert_histopathology(image_of((180, 120, 160)))  # pink/purple — should not raise


@pytest.mark.parametrize("color", [(60, 160, 70), (120, 120, 120), (80, 150, 220)])
def test_rejects_non_histopathology(color):
    with pytest.raises(NotHistopathologyError):
        assert_histopathology(image_of(color))


def test_he_fraction_higher_for_pink_than_green():
    pink, _ = he_stain_profile(image_of((180, 120, 160)))
    green, _ = he_stain_profile(image_of((60, 160, 70)))
    assert pink > 0.4 > green
