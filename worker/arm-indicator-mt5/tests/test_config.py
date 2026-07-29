from pathlib import Path

import pytest

from arm_mt5_worker.config import ConfigError, load_config


def test_config_requires_day_timezone_and_terminal(tmp_path):
    config = tmp_path / "worker.env"
    config.write_text("MT5_TERMINAL_PATH=C:\\MT5\\terminal64.exe\nMT5_EXPECTED_LOGIN=123\nMT5_EXPECTED_SERVER=Demo\nARM_INDICATOR_PUBLISH_URL=https://example.test\nARM_INDICATOR_PUBLISH_SECRET=" + "x" * 32 + "\n", encoding="utf-8")
    loaded = load_config(config, require_runtime=False)
    assert loaded.day_timezone == ""
    with pytest.raises(ConfigError, match="ARM_DAY_TIMEZONE"):
        load_config(config, require_runtime=True)
