# MCP Server Conventions

The MCP server is the centerpiece of this project's resume value. Get this right.

## What it is

A small server inside the FastAPI backend that exposes two tools via the Model Context Protocol (MCP):

- `classify_histopath_image` — runs the ResNet50 classifier on an input image.
- `generate_gradcam_heatmap` — runs Grad-CAM on an input image; returns the overlay image and a textual attention summary.

The server is consumed by two kinds of clients:

1. The in-app agent (Gemini 2.5 Flash, agent loop in `backend/app/agent/loop.py`).
2. External clients — `examples/external_agent_demo.py`, Claude Desktop, or any other MCP-aware agent.

Same tools, two consumers — this dual-use story is the point.

## Implementation

- Use Anthropic's official `mcp` Python SDK.
- Transport: SSE over HTTP, mounted at `/mcp/sse` in the FastAPI app.
- Tools live in `backend/app/mcp_server/tools.py` as functions decorated with `@mcp.tool()`.
- Tools delegate to the same domain modules as the REST endpoints (`model.inference.predict`, `model.gradcam.generate`). Never duplicate logic between an MCP tool and a REST handler.

## Tool contract

Both tools take a base64-encoded image as input. Define input and output schemas as pydantic models so they round-trip through MCP cleanly.

```python
@mcp.tool()
async def classify_histopath_image(image_base64: str) -> ClassificationResult:
    """Classify a breast histopathology slide as benign or malignant.

    Use this when the user asks for the model's prediction on a slide.
    Returns predicted class, confidence, and a prediction ID.
    """
    image_bytes = base64.b64decode(image_base64)
    return await asyncio.to_thread(inference.predict, image_bytes)
```

Tool descriptions matter — they are what the LLM reads to decide when to use the tool. Be specific, clinical, and unambiguous. Bad: "predicts cancer." Good: "Classify a breast histopathology slide as benign or malignant; use when the user asks for the model's prediction on a slide."

## What NOT to do

- Don't add a third tool just because it sounds cool. Two tools is the right number for this project.
- Don't expose internal infrastructure as tools (no "ping", "health", or "get version" tools — those belong on the REST API).
- Don't embed business logic in the tool function itself — delegate to the domain modules.
- Don't return huge payloads. Outputs must fit comfortably in an LLM context window.

## External client demo

`examples/external_agent_demo.py` must work standalone: clone repo, install requirements, set `GEMINI_API_KEY`, run. It proves the MCP server is portable. Do not break it when refactoring the server.

## Claude Desktop integration (bonus, in README)

A 5-line snippet in the README shows how to add the MCP server to `claude_desktop_config.json`. Tested manually by the user, not in CI.
