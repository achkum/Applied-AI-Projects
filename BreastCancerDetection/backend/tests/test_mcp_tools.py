import asyncio
import base64

from app.mcp_server import tools
from app.model import inference
from app.schemas import ClassificationResult, HeatmapResult


def test_classify_tool_matches_rest_inference(png_bytes):
    """MCP tool must delegate to the same domain module as REST (no duplicated logic)."""
    image_b64 = base64.b64encode(png_bytes).decode()
    tool_result = asyncio.run(tools.classify_histopath_image(image_b64))
    direct_result = inference.predict(png_bytes)

    assert isinstance(tool_result, ClassificationResult)
    assert tool_result.predicted_class == direct_result.predicted_class
    assert tool_result.probability_malignant == direct_result.probability_malignant


def test_gradcam_tool_returns_heatmap(png_bytes):
    image_b64 = base64.b64encode(png_bytes).decode()
    result = asyncio.run(tools.generate_gradcam_heatmap(image_b64, 0.5))
    assert isinstance(result, HeatmapResult)
    assert base64.b64decode(result.heatmap_base64).startswith(b"\x89PNG\r\n\x1a\n")


def test_exactly_two_tools_registered():
    """The project deliberately exposes exactly two tools — no health/version/ping tools."""
    registered = asyncio.run(tools.mcp.list_tools())
    names = {t.name for t in registered}
    assert names == {"classify_histopath_image", "generate_gradcam_heatmap"}
