#!/usr/bin/env python3
"""Persistent maintenance/dispatch budgets; counters never imply billed usage."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import re
import subprocess
import time

BUDGETS = {"S": 30, "M": 120, "L": 240}


def blockers(session, now):
    reasons = []
    if now - session["started"] >= BUDGETS[session["size"]] * 60:
        reasons.append("task time budget exhausted")
    if now - session["progress_at"] >= 45 * 60 or session["calls_without_progress"] >= 25:
        reasons.append("no-progress limit reached")
    if max(session["failures"].values(), default=0) >= 3:
        reasons.append("same failure reached three attempts")
    if max(session["rejections"].values(), default=0) >= 2:
        reasons.append("same review reason rejected twice")
    return reasons


def start(state, task, size, role, mode, now, paused=False):
    if paused and mode != "maintenance":
        raise ValueError("feature development is paused; maintenance authorization required")
    active = [s for s in state.values() if s["status"] == "ACTIVE"]
    if task in state and state[task]["status"] == "ACTIVE":
        raise ValueError("task already active; checkpoint instead of resetting counters")
    if role == "specialist" and sum(s["role"] == role for s in active) >= 4:
        raise ValueError("four-specialist concurrency limit reached")
    attempt = state.get(task, {}).get("attempt", 0) + 1
    if attempt > 3:
        raise ValueError("three dispatches exhausted; founder decision required")
    if state.get(task, {}).get("status") == "BLOCKED" and attempt > 2:
        raise ValueError("narrower redispatch also blocked; founder decision required")
    state[task] = {
        "task": task, "size": size, "role": role, "mode": mode,
        "model_tier": "luna" if role == "specialist" else "main",
        "attempt": attempt, "status": "ACTIVE", "started": now,
        "progress_at": now, "calls_without_progress": 0, "tool_calls": 0,
        "failures": {}, "rejections": {}, "heavy": False,
        "input_tokens": None, "output_tokens": None, "blocked_reasons": [],
    }
    return state[task]


def checkpoint(state, task, now, calls=0, progress=False, failure=None,
               rejection=None, heavy=None):
    session = state[task]
    if session["status"] != "ACTIVE":
        raise ValueError("task is not active; hand back to Conductor")
    if calls < 0:
        raise ValueError("tool calls must be nonnegative")
    # Evaluate existing limits before allowing new progress to erase them.
    reasons = blockers(session, now)
    if reasons:
        session.update(status="BLOCKED", blocked_reasons=reasons, heavy=False)
        return session
    session["tool_calls"] += calls
    session["calls_without_progress"] += calls
    if progress:
        session["progress_at"] = now
        session["calls_without_progress"] = 0
    for field, signature in (("failures", failure), ("rejections", rejection)):
        if signature:
            session[field][signature] = session[field].get(signature, 0) + 1
    if heavy is not None:
        if heavy and any(s["heavy"] and s["status"] == "ACTIVE" for k, s in state.items() if k != task):
            raise ValueError("one-heavy-job limit reached")
        session["heavy"] = heavy
    reasons = blockers(session, now)
    if reasons:
        session.update(status="BLOCKED", blocked_reasons=reasons, heavy=False)
    return session


def metrics(board, source, head, now):
    records = []
    for line in board.splitlines():
        match = re.search(r"\{id:\s*([\w-]+),.*?status:\s*([A-Z_]+)", line)
        if match:
            records.append(match.groups())
    if not records or len({r[0] for r in records}) != len(records):
        raise ValueError("board has no records or duplicate task IDs")
    done = sorted(task for task, status in records if status == "DONE")
    return {
        "as_of": datetime.fromtimestamp(now, timezone.utc).date().isoformat(),
        "source": source, "source_head": head,
        "completed_task_ids": done, "completed_task_count": len(done),
        "record_count": len(records), "status_counts": dict(sorted(Counter(status for _, status in records).items())),
        "throughput_today": None, "cycle_time_hours": None,
        "reopen_rate": None, "escalation_count": None,
        "input_tokens": None, "output_tokens": None,
        "limitations": "Board snapshot at the selected ref; parent/child records overlap. DONE statuses are board claims, not fresh QA. Work on other refs is not included. Historical throughput, cycle time, escalations and provider usage not measured.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True, help="Persistent ignored session JSON outside tracked code")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("start")
    p.add_argument("task")
    p.add_argument("--size", choices=BUDGETS, required=True)
    p.add_argument("--role", choices=["conductor", "specialist"], required=True)
    p.add_argument("--mode", choices=["feature", "maintenance"], required=True)
    p.add_argument("--pause-file", type=Path, required=True)
    p = sub.add_parser("checkpoint")
    p.add_argument("task")
    p.add_argument("--calls", type=int, default=0)
    p.add_argument("--progress", action="store_true")
    p.add_argument("--failure")
    p.add_argument("--rejection")
    p.add_argument("--heavy", choices=["start", "end"])
    p = sub.add_parser("finish")
    p.add_argument("task")
    p = sub.add_parser("metrics")
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--ref", default="origin/main")
    p.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    now = time.time()
    if args.command == "metrics":
        head = subprocess.check_output(["git", "-C", str(args.repo), "rev-parse", args.ref], text=True).strip()
        board = subprocess.check_output(["git", "-C", str(args.repo), "show", f"{head}:SubTrack/.sdlc/backlog.yaml"], text=True)
        result = metrics(board, args.ref, head, now)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"completed": result["completed_task_count"], "source_head": head}))
        return 0
    args.state.parent.mkdir(parents=True, exist_ok=True)
    with args.state.with_suffix(".lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads(args.state.read_text()) if args.state.exists() else {}
        try:
            if args.command == "start":
                pause = json.loads(args.pause_file.read_text())
                if pause.get("development") not in {"PAUSED_BY_USER", "ACTIVE_BY_USER"}:
                    raise ValueError("missing or invalid development authorization state")
                paused = pause["development"] == "PAUSED_BY_USER"
                result = start(state, args.task, args.size, args.role, args.mode, now, paused)
            elif args.command == "checkpoint":
                result = checkpoint(state, args.task, now, args.calls, args.progress,
                                    args.failure, args.rejection, None if not args.heavy else args.heavy == "start")
            else:
                result = checkpoint(state, args.task, now)
                if result["status"] == "ACTIVE":
                    result.update(status="FINISHED", finished=now, heavy=False)
        except (ValueError, KeyError, OSError) as error:
            parser.exit(2, f"Guard rejected action: {error}\n")
        args.state.write_text(json.dumps(state, indent=2) + "\n")
        print(json.dumps(result))
        return 2 if result["status"] == "BLOCKED" else 0


if __name__ == "__main__":
    raise SystemExit(main())
