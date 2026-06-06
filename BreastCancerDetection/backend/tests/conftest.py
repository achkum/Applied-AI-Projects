import io

import pytest
from PIL import Image


@pytest.fixture
def png_bytes() -> bytes:
    """A small synthetic RGB PNG — exercises the pipeline shape (not a real slide)."""
    buf = io.BytesIO()
    Image.new("RGB", (96, 96), color=(180, 120, 160)).save(buf, format="PNG")
    return buf.getvalue()
