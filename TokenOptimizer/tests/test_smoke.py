import token_saver
from token_saver.cli import main


def test_import_package():
    assert token_saver.__version__


def test_cli_main_returns_zero(capsys):
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "token-saver" in out
