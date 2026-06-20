"""Command-line entry point: `token-optimizer start | download-model | stats | mcp`."""

import argparse
import json
import os
import sys

from tokenoptim import __version__
from tokenoptim.core.types import OptimizerConfig


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="token-optimizer",
        description="Local LLM token-reduction engine: proxy, MCP server, and savings page.",
    )
    parser.add_argument("--version", action="version", version=f"token-optimizer {__version__}")
    sub = parser.add_subparsers(dest="command")

    start = sub.add_parser("start", help="run the optimizing proxy and savings page")
    start.add_argument("--port", type=int, default=8484)
    start.add_argument("--host", default="127.0.0.1")
    start.add_argument("--enable-compression", action="store_true", help="enable prompt compression")
    start.add_argument("--brevity", action="store_true", help="inject a concise-output directive")
    start.add_argument("--max-output-tokens", type=int, default=None)

    dl = sub.add_parser("download-model", help="download + int8-quantize the LLMLingua-2 model")
    dl.add_argument(
        "--out",
        default=os.getenv("TS_MODEL_DIR", ".models/llmlingua2-bert"),
        help="output model directory (default: $TS_MODEL_DIR or .models/llmlingua2-bert)",
    )

    stats = sub.add_parser("stats", help="print savings from a running instance")
    stats.add_argument("--port", type=int, default=8484)
    stats.add_argument("--host", default="127.0.0.1")

    sub.add_parser("mcp", help="run the MCP server over stdio")

    web = sub.add_parser("web", help="run the hosted engine demo (secret-free; for Cloud Run)")
    web.add_argument("--port", type=int, default=int(os.getenv("PORT", "8080")))
    web.add_argument("--host", default="0.0.0.0")
    return parser


def config_from_args(args: argparse.Namespace) -> OptimizerConfig:
    return OptimizerConfig(
        enable_compression=args.enable_compression,
        inject_brevity=args.brevity,
        max_output_tokens=args.max_output_tokens,
    )


def _cmd_start(args: argparse.Namespace) -> int:
    import uvicorn

    from tokenoptim.pillars.proxy.server import app_factory

    app = app_factory(config_from_args(args))
    base = f"http://{args.host}:{args.port}"
    print(f"token-optimizer proxy listening on {base}")
    print("Point your client at it with one of:")
    print(f"  export ANTHROPIC_BASE_URL={base}")
    print(f"  export OPENAI_BASE_URL={base}")
    print(f"Savings page: {base}/")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


def _cmd_download(args: argparse.Namespace) -> int:
    from tokenoptim.compress.llmlingua import download_and_quantize

    print(f"Downloading + quantizing the LLMLingua-2 model into {args.out} …")
    dst = download_and_quantize(args.out)
    print(f"Done: {dst}. Upload it (+ the tokenizer files) to your model bucket for the service.")
    return 0


def _cmd_stats(args: argparse.Namespace) -> int:
    import httpx

    url = f"http://{args.host}:{args.port}/stats"
    try:
        resp = httpx.get(url, timeout=5.0)
        resp.raise_for_status()
    except httpx.HTTPError:
        print(
            f"Could not reach token-optimizer at {url}. Is it running? Start it with `token-optimizer start`.",
            file=sys.stderr,
        )
        return 1
    print(json.dumps(resp.json(), indent=2))
    return 0


def _cmd_mcp(args: argparse.Namespace) -> int:
    from tokenoptim.pillars.mcp_server import main as mcp_main

    mcp_main()
    return 0


def _cmd_web(args: argparse.Namespace) -> int:
    import uvicorn

    from tokenoptim.pillars.webapp import app_factory

    print(f"token-optimizer engine demo on http://{args.host}:{args.port}")
    uvicorn.run(app_factory(), host=args.host, port=args.port, log_level="info")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command is None:
        print(f"token-optimizer {__version__}")
        return 0
    return {
        "start": _cmd_start,
        "download-model": _cmd_download,
        "stats": _cmd_stats,
        "mcp": _cmd_mcp,
        "web": _cmd_web,
    }[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
