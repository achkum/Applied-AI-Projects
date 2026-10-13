import unittest
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from task_guard import start, checkpoint, metrics, rotate_context, validate_dispatch, state_lock


def envelope(task, session="fresh-1"):
    return {"contract": "DISPATCH/v1", "task_id": task, "model_tier": "luna",
            "fork_turns": "none", "session_id": session}


class GuardTests(unittest.TestCase):
    def test_cli_state_updates_wait_for_cross_process_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            state, pause = Path(tmp)/"state.json", Path(tmp)/"pause.json"
            pause.write_text(json.dumps({"development": "ACTIVE_BY_USER"}))
            args = [sys.executable, str(Path(__file__).with_name("task_guard.py")), "--state", str(state),
                    "start", "ST-LOCK", "--size", "S", "--role", "conductor", "--mode", "feature",
                    "--pause-file", str(pause)]
            with state_lock(state.with_suffix(".lock")):
                process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                try:
                    with self.assertRaises(subprocess.TimeoutExpired):
                        process.communicate(timeout=0.3)
                    self.assertFalse(state.exists())
                except BaseException:
                    process.kill()
                    process.communicate()
                    raise
            _, error = process.communicate(timeout=15)
            self.assertEqual(process.returncode, 0, error.decode())
            self.assertEqual(json.loads(state.read_text())["ST-LOCK"]["status"], "ACTIVE")

    def test_cli_pause_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            state, pause = Path(tmp)/"state.json", Path(tmp)/"pause.json"
            dispatch = Path(tmp)/"dispatch.json"
            dispatch.write_text(json.dumps(envelope("ST-168")))
            args = [sys.executable, str(Path(__file__).with_name("task_guard.py")), "--state", str(state),
                    "start", "ST-168", "--size", "S", "--role", "specialist", "--mode", "feature"]
            args += ["--dispatch-file", str(dispatch)]
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

    def test_pause_and_progressing_long_task(self):
        with self.assertRaisesRegex(ValueError, "paused"):
            start({}, "ST-1", "S", "specialist", "feature", 0, True)
        state = self.session()
        for now in range(1200, 30001, 1200):
            self.assertEqual(checkpoint(state, "ST-168", now, calls=20, progress=True)["status"], "ACTIVE")
        self.assertGreater(state["ST-168"]["tool_calls"], 20)

    def test_luna_routing_and_concurrency(self):
        state = {}
        for i in range(4):
            self.assertEqual(start(state, str(i), "M", "specialist", "maintenance", 0, dispatch=envelope(str(i), str(i)))["model_tier"], "luna")
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

    def test_redispatch_retains_history_without_generic_attempt_ceiling(self):
        state = self.session()
        with self.assertRaisesRegex(ValueError, "already active"):
            start(state, "ST-168", "S", "conductor", "maintenance", 1)
        checkpoint(state, "ST-168", 1, calls=3, progress=True, failure="flaky", rejection="shape")
        state["ST-168"].update(input_tokens=12, output_tokens=5)
        for attempt in range(2, 7):
            state["ST-168"].update(status="FINISHED", heavy=False, finished=1 if attempt == 2 else (attempt - 1) * 10000)
            result = start(state, "ST-168", "S", "conductor", "maintenance", attempt * 10000)
            self.assertEqual(result["attempt"], attempt)
            self.assertEqual(result["tool_calls"], 3)
            self.assertEqual(result["failures"], {"flaky": 1})
            self.assertEqual(result["rejections"], {"shape": 1})
            self.assertEqual((result["input_tokens"], result["output_tokens"]), (12, 5))
        self.assertEqual(checkpoint(state, "ST-168", 60001, rejection="shape")["status"], "BLOCKED")
        with self.assertRaisesRegex(ValueError, "cannot erase"):
            start(state, "ST-168", "S", "conductor", "maintenance", 60002)

    def test_redispatch_excludes_idle_but_retains_active_no_progress_time(self):
        state = self.session()
        checkpoint(state, "ST-168", 1800)
        state["ST-168"].update(status="FINISHED", finished=1800)
        start(state, "ST-168", "S", "conductor", "maintenance", 10000)
        self.assertEqual(checkpoint(state, "ST-168", 10100)["status"], "ACTIVE")
        self.assertEqual(checkpoint(state, "ST-168", 10900)["status"], "BLOCKED")

    def test_late_progress_cannot_erase_a_long_tool_batch(self):
        self.assertEqual(checkpoint(self.session("M"), "ST-168", 1, calls=30, progress=True)["status"], "BLOCKED")
        self.assertEqual(checkpoint(self.session("M"), "ST-168", 1, calls=25, progress=True)["status"], "ACTIVE")

    def test_one_heavy_job(self):
        state = self.session()
        start(state, "other", "M", "specialist", "maintenance", 0, dispatch=envelope("other"))
        checkpoint(state, "ST-168", 1, heavy=True)
        with self.assertRaisesRegex(ValueError, "heavy"):
            checkpoint(state, "other", 2, heavy=True)
        checkpoint(state, "ST-168", 3, heavy=False)
        self.assertTrue(checkpoint(state, "other", 4, heavy=True)["heavy"])

    def test_dispatch_identity_required_and_size_is_not_a_stop(self):
        with self.assertRaisesRegex(ValueError, "envelope"):
            start({}, "ST-1", "M", "specialist", "maintenance", 0)
        for value in ({**envelope("ST-1"), "fork_turns": "invalid"},
                      {**envelope("ST-1"), "model_tier": "unknown"},
                      {**envelope("ST-1"), "task_id": "OTHER"}):
            with self.assertRaises(ValueError):
                validate_dispatch(value, "ST-1", {})
        self.assertEqual(validate_dispatch({**envelope("ST-1"), "history": "x"*20000}, "ST-1", {}), "fresh-1")
        for tier in ("sol", "default", "inherited"):
            result = start({}, "ST-1", "M", "specialist", "feature", 0,
                           dispatch={**envelope("ST-1"), "model_tier": tier, "fork_turns": "all"})
            self.assertEqual(result["model_tier"], tier)
        dispatch = envelope("ST-1")
        del dispatch["model_tier"]
        self.assertEqual(start({}, "ST-1", "M", "specialist", "feature", 0, dispatch=dispatch)["model_tier"], "inherited")

    def test_optional_context_rotation_retains_safety_history(self):
        state = {}
        start(state, "ST-1", "M", "specialist", "maintenance", 0, dispatch=envelope("ST-1"))
        result = checkpoint(state, "ST-1", 1, calls=20, progress=True, failure="flaky")
        self.assertEqual(result["status"], "ACTIVE")
        with self.assertRaisesRegex(ValueError, "already used"):
            rotate_context(state, "ST-1", 2, envelope("ST-1"), "source/test receipt")
        with self.assertRaisesRegex(ValueError, "checkpoint"):
            rotate_context(state, "ST-1", 2, envelope("ST-1", "fresh-2"), " ")
        result = rotate_context(state, "ST-1", 2,
                                {**envelope("ST-1", "fresh-2"), "model_tier": "sol"}, "source/test receipt\n"*500)
        self.assertEqual((result["started"], result["attempt"], result["tool_calls"]), (0, 1, 20))
        self.assertEqual(result["failures"], {"flaky": 1})
        self.assertEqual(result["model_tier"], "sol")
        self.assertEqual(result["status"], "ACTIVE")
        self.assertEqual(checkpoint(state, "ST-1", 1802, progress=True)["status"], "ACTIVE")
        self.assertEqual(rotate_context(state, "ST-1", 7200, envelope("ST-1", "fresh-3"), "receipt")["status"], "BLOCKED")

    def test_handoff_cannot_hide_repeated_failure_or_no_progress(self):
        state = {}
        start(state, "ST-1", "M", "specialist", "feature", 0, dispatch=envelope("ST-1"))
        checkpoint(state, "ST-1", 1, failure="same")
        rotate_context(state, "ST-1", 2, envelope("ST-1", "fresh-2"), "diagnosis")
        checkpoint(state, "ST-1", 3, failure="same")
        rotate_context(state, "ST-1", 4, envelope("ST-1", "fresh-3"), "diagnosis")
        self.assertEqual(checkpoint(state, "ST-1", 5, failure="same")["status"], "BLOCKED")
        state = {}
        start(state, "ST-1", "M", "specialist", "feature", 0, dispatch=envelope("ST-1"))
        checkpoint(state, "ST-1", 1, calls=24)
        rotate_context(state, "ST-1", 2, envelope("ST-1", "fresh-2"), "diagnosis")
        self.assertEqual(checkpoint(state, "ST-1", 3, calls=1)["status"], "BLOCKED")

    def test_metrics_unknown_is_not_zero(self):
        result = metrics('- {id: ST-1, status: DONE}\n- {id: ST-2, status: BLOCKED}', 'origin/main', 'abc', 0)
        self.assertEqual(result["completed_task_count"], 1)
        self.assertEqual(result["status_counts"], {"BLOCKED": 1, "DONE": 1})
        self.assertIsNone(result["throughput_today"])
        with self.assertRaises(ValueError):
            metrics('- {id: ST-1, status: DONE}\n- {id: ST-1, status: DONE}', 'main', 'abc', 0)


if __name__ == "__main__":
    unittest.main()
