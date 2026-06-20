import socket
import threading
import time

import httpx
import pytest
import uvicorn
from tokenoptim.pillars.cli import build_parser, config_from_args, main
from tokenoptim.pillars.proxy.server import app_factory


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_help_lists_subcommands(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["--help"])
    assert exc.value.code == 0
    out = capsys.readouterr().out
    for cmd in ("start", "download-model", "stats", "mcp"):
        assert cmd in out


def test_no_command_prints_version(capsys):
    assert main([]) == 0
    assert "token-optimizer" in capsys.readouterr().out


def test_config_from_args():
    args = build_parser().parse_args(
        ["start", "--enable-compression", "--brevity", "--max-output-tokens", "256"]
    )
    cfg = config_from_args(args)
    assert cfg.enable_compression is True
    assert cfg.inject_brevity is True
    assert cfg.max_output_tokens == 256


def test_stats_no_server_fails_friendly(capsys):
    code = main(["stats", "--port", str(free_port())])
    assert code == 1
    assert "Could not reach token-optimizer" in capsys.readouterr().err


def test_start_boots_and_health_responds():
    port = free_port()
    server = uvicorn.Server(
        uvicorn.Config(app_factory(), host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not server.started:
            time.sleep(0.05)
        assert server.started
        resp = httpx.get(f"http://127.0.0.1:{port}/health", timeout=5.0)
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
    finally:
        server.should_exit = True
        thread.join(timeout=10)
