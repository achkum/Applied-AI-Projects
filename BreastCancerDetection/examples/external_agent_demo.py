"""Standalone MCP client demo for the histopathology CDSS server.

Proves the MCP server is portable: any MCP-aware client can connect over SSE and use the same
two tools the in-app agent uses. No Gemini key required — this exercises the tools directly.

Usage:
    # 1. Start the backend in another terminal:
    #    cd backend && uv run uvicorn app.main:app
    # 2. Install client deps and run:
    pip install "mcp>=1.2" pillow
    python external_agent_demo.py [path/to/slide.png]

If no image path is given, a synthetic placeholder image is used (predictions won't be meaningful).
"""

import asyncio
import base64
import io
import sys

from mcp import ClientSession
from mcp.client.sse import sse_client

SERVER_URL = "http://localhost:8000/mcp/sse"


def load_image_b64(path: str | None) -> str:
    if path:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode()
    from PIL import Image  # only needed for the synthetic fallback

    buf = io.BytesIO()
    Image.new("RGB", (299, 299), color=(180, 120, 160)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


async def main() -> None:
    image_b64 = load_image_b64(sys.argv[1] if len(sys.argv) > 1 else None)

    async with sse_client(SERVER_URL) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            print("Available tools:", [t.name for t in tools.tools])

            classification = await session.call_tool(
                "classify_histopath_image", {"image_base64": image_b64}
            )
            print("\nClassification:", classification.structuredContent)

            heatmap = await session.call_tool(
                "generate_gradcam_heatmap",
                {"image_base64": image_b64, "overlay_opacity": 0.5},
            )
            summary = (heatmap.structuredContent or {}).get("attention_summary")
            print("\nGrad-CAM attention summary:", summary)
            print("(heatmap PNG returned as base64, omitted here)")


if __name__ == "__main__":
    asyncio.run(main())
