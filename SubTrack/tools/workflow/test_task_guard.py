import unittest
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from task_guard import start, checkpoint, metrics


class GuardTests(unittest.TestCase):
    def test_cli_pause_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            state, pause = Path(tmp)/"state.json", Path(tmp)/"pause.json"
            args = [sys.executable, str(Path(__file__).with_name("task_guard.py")), "--state", str(state),
                    "start", "ST-168", "--size", "S", "--role", "specialist", "--mode", "feature"]
            def code(extra):
                return subprocess.run(args + extra, capture_output=True).returncode
            self.assertEqual(code([]), 2)
            self.assertEqual(code(["--pause-file", str(pause)]), 2)
            for value in ("invalid json", "{}", json.dumps({"development":"PAUSED_BY_USER"})):
                pause.write_text(value)
                self.assertEqual(code(["--pause-file", str(pause)]), 2)
                self.assertFalse(state.exists())
            pause.write_text(json.dumps({"development":"ACTIVE_BY_USER"}))
            self.assertEqual(code(["--pause-file", str(pause)]), 0)

    def session(self, size="S"):
        state = {}
        start(state, "ST-168", size, "conductor", "maintenance", 0, True)
        return state

    def test_pause_and_small_budget(self):
        with self.assertRaisesRegex(ValueError, "paused"):
            start({}, "ST-1", "S", "specialist", "feature", 0, True)
        self.assertEqual(checkpoint(self.session(), "ST-168", 1800)["status"], "BLOCKED")

    def test_luna_routing_and_concurrency(self):
        state = {}
        for i in range(4):
            self.assertEqual(start(state, str(i), "M", "specialist", "maintenance", 0)["model_tier"], "luna")
        with self.assertRaisesRegex(ValueError, "concurrency"):
            start(state, "fifth", "S", "specialist", "maintenance", 0)

    def test_same_failure_limit(self):
        state = self.session()
        for i in range(3):
            result = checkpoint(state, "ST-168", i, failure="missing-selector")
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIsNone(result["input_tokens"])

    def test_review_limit(self):
        state = self.session()
        checkpoint(state, "ST-168", 1, rejection="same-reason")
        self.assertEqual(checkpoint(state, "ST-168", 2, rejection="same-reason")["status"], "BLOCKED")

    def test_progress_and_no_progress(self):
        state = self.session("M")
        checkpoint(state, "ST-168", 1, calls=24)
        checkpoint(state, "ST-168", 2, progress=True)
        self.assertEqual(checkpoint(state, "ST-168", 3, calls=24)["status"], "ACTIVE")
        self.assertEqual(checkpoint(state, "ST-168", 4, calls=1)["status"], "BLOCKED")
        self.assertEqual(checkpoint(self.session("M"), "ST-168", 2700, progress=True)["status"], "BLOCKED")

    def test_no_counter_reset_and_redispatch_ceiling(self):
        state = self.session()
        with self.assertRaisesRegex(ValueError, "already active"):
            start(state, "ST-168", "S", "conductor", "maintenance", 1)
        checkpoint(state, "ST-168", 1800)
        self.assertEqual(start(state, "ST-168", "S", "conductor", "maintenance", 1801)["attempt"], 2)
        checkpoint(state, "ST-168", 3601)
        with self.assertRaisesRegex(ValueError, "founder"):
            start(state, "ST-168", "S", "conductor", "maintenance", 3602)

    def test_late_progress_cannot_erase_a_long_tool_batch(self):
        self.assertEqual(checkpoint(self.session("M"), "ST-168", 1, calls=30, progress=True)["status"], "BLOCKED")
        self.assertEqual(checkpoint(self.session("M"), "ST-168", 1, calls=25, progress=True)["status"], "ACTIVE")

    def test_one_heavy_job(self):
        state = self.session()
        start(state, "other", "M", "specialist", "maintenance", 0)
        checkpoint(state, "ST-168", 1, heavy=True)
        with self.assertRaisesRegex(ValueError, "heavy"):
            checkpoint(state, "other", 2, heavy=True)
        checkpoint(state, "ST-168", 3, heavy=False)
        self.assertTrue(checkpoint(state, "other", 4, heavy=True)["heavy"])

    def test_metrics_unknown_is_not_zero(self):
        result = metrics('- {id: ST-1, status: DONE}\n- {id: ST-2, status: BLOCKED}', 'origin/main', 'abc', 0)
        self.assertEqual(result["completed_task_count"], 1)
        self.assertEqual(result["status_counts"], {"BLOCKED": 1, "DONE": 1})
        self.assertIsNone(result["throughput_today"])
        with self.assertRaises(ValueError):
            metrics('- {id: ST-1, status: DONE}\n- {id: ST-1, status: DONE}', 'main', 'abc', 0)


if __name__ == "__main__":
    unittest.main()
