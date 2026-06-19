import token_optimizer
from token_optimizer.cli import main


def test_import_package():
    assert token_optimizer.__version__


def test_cli_main_returns_zero(capsys):
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "token-optimizer" in out
