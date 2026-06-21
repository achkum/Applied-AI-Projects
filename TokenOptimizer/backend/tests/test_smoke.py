import cutok
from cutok.pillars.cli import main


def test_import_package():
    assert cutok.__version__


def test_cli_main_returns_zero(capsys):
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "cutok" in out
