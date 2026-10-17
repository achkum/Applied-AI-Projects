"""Keep independent CI findings visible without changing any failed gate to success."""
import pathlib
import re
import unittest


POLICY = {
    "checkout": ("Checkout", []),
    "pnpm": ("Set up pnpm", ["checkout"]),
    "node": ("Set up Node.js", ["checkout", "pnpm"]),
    "maintenance": ("Test maintenance workflow helpers", ["checkout", "node"]),
    "dependencies": ("Install workspace dependencies", ["checkout", "pnpm", "node"]),
    "lint": ("Lint", ["dependencies"]),
    "typecheck": ("Typecheck", ["dependencies"]),
    "contrast": ("Token contrast check (ST-020)", ["dependencies"]),
    "playwright": ("Install Playwright browsers (Storybook and catalogue extraction)", ["dependencies"]),
    "tests": ("Tests", ["dependencies", "playwright"]),
    "visual": ("Visual regression — Storybook (ST-022)", ["dependencies", "playwright"]),
    "python": ("Set up Python 3.12", ["checkout"]),
    "uv": ("Set up uv", ["checkout", "python"]),
    "ml_dependencies": ("Install locked ML dependencies", ["python", "uv"]),
    "ml_tests": ("Test ML endpoints", ["ml_dependencies"]),
    "i18n": ("i18n catalog parity", ["checkout", "node"]),
    "gitleaks": ("Gitleaks secret scan", ["checkout"]),
    "gitleaks_range": ("Gitleaks complete pull request range", ["checkout", "gitleaks"]),
    "licenses": ("License check", ["dependencies"]),
}


class QualityGatePolicy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = pathlib.Path(__file__).resolve().parents[3] / ".github/workflows/subtrack-ci.yml"
        cls.source = path.read_text(encoding="utf-8").split("  quality-gates:\n", 1)[1]
        cls.steps = {}
        for match in re.finditer(r"^      - name: ([^\n]+)\n(.*?)(?=^      - name: |\Z)", cls.source, re.M | re.S):
            name, block = match.groups()
            identifier = re.search(r"^        id: ([a-z][a-z0-9_]*)$", block, re.M)
            if not identifier:
                raise AssertionError(f"Missing prerequisite identity: {name}")
            cls.steps[identifier.group(1)] = (name, block)

    def test_every_original_check_has_only_its_successful_prerequisites(self):
        self.assertEqual(list(self.steps), list(POLICY))
        self.assertNotIn("continue-on-error", self.source)
        for identifier, (name, prerequisites) in POLICY.items():
            actual_name, block = self.steps[identifier]
            self.assertEqual(actual_name, name)
            guards = re.findall(r"^        if: (.+)$", block, re.M)
            expected = "${{ !cancelled() && " + " && ".join(
                f"steps.{dependency}.outcome == 'success'" for dependency in prerequisites
            ) + " }}"
            self.assertEqual(guards, [expected] if prerequisites else [])
        for identifier, command in {
            "lint": "run: pnpm lint", "typecheck": "run: pnpm typecheck",
            "tests": "run: pnpm exec turbo run test --concurrency=1",
            "contrast": "node packages/ui-tokens/scripts/check-contrast.mjs",
            "visual": "pnpm --filter @subtrack/ui run storybook:test",
            "ml_dependencies": "run: uv sync --locked", "ml_tests": "run: uv run --locked pytest",
            "i18n": "node packages/i18n/scripts/check-parity.mjs",
            "gitleaks": "uses: gitleaks/gitleaks-action@v2",
            "gitleaks_range": "gitleaks detect --redact --exit-code=2",
            "licenses": "pnpm licenses list --json",
        }.items():
            self.assertIn(command, self.steps[identifier][1])

    @staticmethod
    def scheduled(failed, cancelled=False):
        outcomes = {}
        for identifier, (_, prerequisites) in POLICY.items():
            run = not cancelled and all(outcomes.get(dependency) == "success" for dependency in prerequisites)
            outcomes[identifier] = ("failure" if identifier in failed else "success") if run else "skipped"
        return outcomes

    def test_lint_type_and_test_failures_remain_failures_while_independent_checks_run(self):
        for failed in ["lint", "typecheck", "tests"]:
            outcomes = self.scheduled({failed})
            self.assertEqual(outcomes[failed], "failure")
            self.assertIn("failure", outcomes.values())  # No continue-on-error or final success override.
            for independent in ["visual", "python", "uv", "ml_dependencies", "ml_tests", "i18n", "gitleaks", "gitleaks_range", "licenses"]:
                self.assertEqual(outcomes[independent], "success", (failed, independent))

    def test_missing_setup_skips_only_dependent_checks_and_cancellation_stops_work(self):
        outcomes = self.scheduled({"dependencies"})
        for dependent in ["lint", "typecheck", "contrast", "playwright", "tests", "visual", "licenses"]:
            self.assertEqual(outcomes[dependent], "skipped")
        for independent in ["python", "uv", "ml_dependencies", "ml_tests", "i18n", "gitleaks", "gitleaks_range"]:
            self.assertEqual(outcomes[independent], "success")
        outcomes = self.scheduled({"python"})
        self.assertEqual(outcomes["ml_tests"], "skipped")
        self.assertEqual(outcomes["tests"], "success")
        self.assertTrue(all(value == "skipped" for value in self.scheduled(set(), cancelled=True).values()))


if __name__ == "__main__":
    unittest.main()
