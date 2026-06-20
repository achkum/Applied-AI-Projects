import app
from app.pillars.cli import main


def test_import_package():
    assert app.__version__


def test_cli_main_returns_zero(capsys):
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "token-optimizer" in out
