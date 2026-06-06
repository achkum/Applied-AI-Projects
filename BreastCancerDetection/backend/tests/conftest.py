import io

import pytest
from PIL import Image


@pytest.fixture
def png_bytes() -> bytes:
    """A small synthetic H&E-like (pink/purple) PNG — passes the input gate."""
    buf = io.BytesIO()
    Image.new("RGB", (96, 96), color=(180, 120, 160)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def non_histopath_png() -> bytes:
    """A solid-green PNG — an out-of-distribution image the input gate must reject."""
    buf = io.BytesIO()
    Image.new("RGB", (96, 96), color=(60, 160, 70)).save(buf, format="PNG")
    return buf.getvalue()
