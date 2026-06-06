import asyncio
import json
import logging
from collections.abc import AsyncIterator

from google import genai
from google.genai import types

from app.agent.prompt import SYSTEM_PROMPT
from app.config import settings
from app.mcp_server.server import mcp
from app.schemas import ChatRequest

logger = logging.getLogger(__name__)

MODEL = "gemini-2.5-flash"
MAX_TOOL_ROUNDS = 5
# The backend injects the slide; the LLM only chooses the tool (and overlay_opacity).
INJECTED_ARGS = {"image_base64"}

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not set.")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def strip_schema(schema: dict) -> dict:
    """Drop pydantic/JSON-schema cruft and the backend-injected args before showing the
    tool to the LLM (it must not try to supply the image itself)."""
    props = {
        k: {pk: pv for pk, pv in v.items() if pk != "title"}
        for k, v in schema.get("properties", {}).items()
        if k not in INJECTED_ARGS
    }
    required = [r for r in schema.get("required", []) if r not in INJECTED_ARGS]
    return {"type": "object", "properties": props, "required": required}


async def build_tools() -> types.Tool:
    declarations = [
        types.FunctionDeclaration(
            name=t.name,
            description=t.description,
            parameters_json_schema=strip_schema(t.inputSchema),
        )
        for t in await mcp.list_tools()
    ]
    return types.Tool(function_declarations=declarations)


async def dispatch_tool(name: str, args: dict, image_base64: str | None) -> dict:
    """Run an MCP tool, injecting the current slide. Returns a JSON-able dict for the LLM."""
    if image_base64 is None:
        return {"error": "No slide has been uploaded yet. Ask the user to upload one."}
    call_args = {**args, "image_base64": image_base64}
    _content_blocks, structured = await mcp.call_tool(name, call_args)
    # Don't feed the giant base64 PNG back into the LLM context — a summary is enough.
    if "heatmap_base64" in structured:
        structured = {k: v for k, v in structured.items() if k != "heatmap_base64"}
    return structured


def build_contents(req: ChatRequest) -> list[types.Content]:
    role_map = {"user": "user", "assistant": "model"}
    contents = [
        types.Content(role=role_map[t.role], parts=[types.Part.from_text(text=t.content)])
        for t in req.history
    ]
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=req.message)]))
    return contents


def generate(contents: list[types.Content], config: types.GenerateContentConfig):
    """Single Gemini call. Isolated so tests can monkeypatch it without hitting the network."""
    return get_client().models.generate_content(model=MODEL, contents=contents, config=config)


def sse(event_type: str, **data) -> str:
    return f"data: {json.dumps({'type': event_type, **data})}\n\n"


async def run_agent(req: ChatRequest) -> AsyncIterator[str]:
    """Drive the Gemini tool-calling loop and yield Server-Sent Events."""
    try:
        tools = await build_tools()
    except Exception as exc:  # missing key surfaces here on first client use
        logger.warning("Agent unavailable: %s", exc)
        yield sse("error", message="The assistant is not configured (missing GEMINI_API_KEY).")
        return

    config = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT, tools=[tools])
    contents = build_contents(req)

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            response = await asyncio.to_thread(generate, contents, config)
        except Exception:
            logger.exception("Gemini call failed")
            yield sse("error", message="The assistant could not complete the request.")
            return

        calls = response.function_calls
        if calls:
            contents.append(response.candidates[0].content)
            for call in calls:
                yield sse("tool", name=call.name)
                result = await dispatch_tool(call.name, dict(call.args or {}), req.image_base64)
                contents.append(
                    types.Content(
                        role="user",
                        parts=[types.Part.from_function_response(name=call.name, response=result)],
                    )
                )
            continue

        for token in (response.text or "").split(" "):
            yield sse("token", text=token + " ")
        yield sse("done")
        return

    yield sse("error", message="The assistant exceeded the tool-call limit.")
