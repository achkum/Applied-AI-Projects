import { describe, expect, it } from "vitest";

import rulesData from "../../../shared/compression_rules.json";
import { compress } from "../ruleCompressor";

type Rule = { id: string; tier?: string };
const RULES = (rulesData as { rules: Rule[] }).rules;
const SAFE_IDS = new Set(RULES.filter((r) => (r.tier ?? "safe") === "safe").map((r) => r.id));
const LOSSY_IDS = new Set(RULES.filter((r) => r.tier === "lossy").map((r) => r.id));

// Kept in sync with tests/test_rule_compressor.py.
const SAFE_FIXTURES: Record<string, string> = {
  politeness_could_you_please: "Could you please help.",
  politeness_please_could: "Please could you help.",
  politeness_i_was_wondering: "I was wondering if you could help.",
  politeness_would_it_be_possible: "Would it be possible to help.",
  politeness_i_would_like_you_to: "I would like you to fix it.",
  politeness_go_ahead_and: "Go ahead and fix it.",
  politeness_feel_free_to: "Feel free to refactor it.",
  politeness_if_you_dont_mind: "If you don't mind, send it.",
  politeness_when_you_get_a_chance: "Fix it when you get a chance.",
  greeting: "Hi there, team.",
  signoff_thanks: "Do the task. Thanks in advance!",
  signoff_appreciate: "Send it. I appreciate your help.",
  meta_as_i_mentioned: "As I mentioned earlier, do it.",
  meta_as_you_know: "As you know, this works.",
  meta_worth_noting: "It is worth noting that this works.",
  meta_needless_to_say: "Needless to say, it works.",
  meta_for_what_its_worth: "For what it's worth, it works.",
  filler_just_to_clarify: "Just to clarify, do it.",
  verbose_in_order_to: "We do this in order to win.",
  verbose_due_to_the_fact: "It failed due to the fact that it broke.",
  verbose_at_this_point_in_time: "At this point in time we stop.",
  verbose_in_the_event_that: "In the event that it fails, retry.",
  verbose_a_number_of: "A large number of items.",
  verbose_in_spite_of_the_fact: "In spite of the fact that it failed, continue.",
  verbose_the_fact_that: "Consider the fact that it works.",
  verbose_with_regard_to: "With regard to the bug, fix it.",
  dedup_sentences: "Do the task. Do the task.",
  squeeze_ws: "a    b    c",
};
const LOSSY_FIXTURES: Record<string, string> = {
  intensifiers: "This is basically fine.",
  hedge_i_think: "I think that we should go.",
  hedge_sort_of: "It is sort of working.",
  hedge_maybe: "Maybe we should try.",
  hedge_to_be_honest: "To be honest, it failed.",
};

function fired(text: string, includeLossy = false): Set<string> {
  return new Set(compress(text, { includeLossy }).changes.map((c) => c.id));
}

describe("ruleCompressor (tiers + quote protection)", () => {
  it("fixtures cover every rule", () => {
    expect(SAFE_IDS).toEqual(new Set(Object.keys(SAFE_FIXTURES)));
    expect(LOSSY_IDS).toEqual(new Set(Object.keys(LOSSY_FIXTURES)));
  });

  it("every safe rule fires by default", () => {
    for (const [id, fixture] of Object.entries(SAFE_FIXTURES)) {
      expect(fired(fixture).has(id), `safe rule ${id} did not fire`).toBe(true);
    }
  });

  it("every lossy rule fires only when opted in", () => {
    for (const [id, fixture] of Object.entries(LOSSY_FIXTURES)) {
      expect(fired(fixture, true).has(id), `lossy rule ${id} did not fire`).toBe(true);
    }
  });

  it("lossy rules are off by default", () => {
    const { text } = compress("This is basically very good, I think.");
    expect(text).toContain("basically");
    expect(text).toContain("very");
    expect(text).toContain("I think");
  });

  it("famous example: safe then lossy", () => {
    const text = "Hi! I was wondering if you could basically help me… Thanks in advance!";
    const safe = compress(text).text;
    expect(safe).toContain("Please");
    expect(safe).not.toContain("Thanks");
    expect(safe).toContain("basically");
    expect(compress(text, { includeLossy: true }).text).not.toContain("basically");
  });

  it("protects quotes and code", () => {
    const out = compress('Drop basically here but "keep basically inside" and `code basically`.', {
      includeLossy: true,
    }).text;
    expect(out).toContain('"keep basically inside"');
    expect(out).toContain("`code basically`");
    expect(out).toContain("Drop here");
  });
});
