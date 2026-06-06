from mcp.server.fastmcp import FastMCP

# The MCP server exposed at /mcp/sse. Consumed by the in-app Gemini agent AND by external
# clients (examples/external_agent_demo.py, Claude Desktop) — same tools, two consumers.
mcp = FastMCP("histopath-cdss")

# Importing tools registers them on `mcp`. Placed after `mcp` is defined to avoid a cycle.
from app.mcp_server import tools  # noqa: E402,F401
