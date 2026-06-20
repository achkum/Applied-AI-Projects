from app.compress.rule_compressor import (
    DEFAULT_RULES_PATH,
    apply_compression_rules,
    load_rules,
)

# One fixture per rule id (kept in sync with the extension test).
SAFE_FIXTURES = {
    "politeness_could_you_please": "Could you please help.",
    "politeness_please_could": "Please could you help.",
    "politeness_i_was_wondering": "I was wondering if you could help.",
    "politeness_would_it_be_possible": "Would it be possible to help.",
    "politeness_i_would_like_you_to": "I would like you to fix it.",
    "politeness_go_ahead_and": "Go ahead and fix it.",
    "politeness_feel_free_to": "Feel free to refactor it.",
    "politeness_if_you_dont_mind": "If you don't mind, send it.",
    "politeness_when_you_get_a_chance": "Fix it when you get a chance.",
    "greeting": "Hi there, team.",
    "signoff_thanks": "Do the task. Thanks in advance!",
    "signoff_appreciate": "Send it. I appreciate your help.",
    "meta_as_i_mentioned": "As I mentioned earlier, do it.",
    "meta_as_you_know": "As you know, this works.",
    "meta_worth_noting": "It is worth noting that this works.",
    "meta_needless_to_say": "Needless to say, it works.",
    "meta_for_what_its_worth": "For what it's worth, it works.",
    "filler_just_to_clarify": "Just to clarify, do it.",
    "verbose_in_order_to": "We do this in order to win.",
    "verbose_due_to_the_fact": "It failed due to the fact that it broke.",
    "verbose_at_this_point_in_time": "At this point in time we stop.",
    "verbose_in_the_event_that": "In the event that it fails, retry.",
    "verbose_a_number_of": "A large number of items.",
    "verbose_the_fact_that": "Consider the fact that it works.",
    "verbose_in_spite_of_the_fact": "In spite of the fact that it failed, continue.",
    "verbose_with_regard_to": "With regard to the bug, fix it.",
    "dedup_sentences": "Do the task. Do the task.",
    "squeeze_ws": "a    b    c",
}
LOSSY_FIXTURES = {
    "intensifiers": "This is basically fine.",
    "hedge_i_think": "I think that we should go.",
    "hedge_sort_of": "It is sort of working.",
    "hedge_maybe": "Maybe we should try.",
    "hedge_to_be_honest": "To be honest, it failed.",
}


def fired(text, include_lossy=False):
    _, changes = apply_compression_rules(text, include_lossy=include_lossy)
    return {c.kind for c in changes}


def test_fixtures_cover_every_rule():
    rules = load_rules(str(DEFAULT_RULES_PATH))
    safe = {r["id"] for r in rules if r.get("tier", "safe") == "safe"}
    lossy = {r["id"] for r in rules if r.get("tier") == "lossy"}
    assert safe == set(SAFE_FIXTURES)
    assert lossy == set(LOSSY_FIXTURES)


def test_every_safe_rule_fires_by_default():
    for rule_id, fixture in SAFE_FIXTURES.items():
        assert rule_id in fired(fixture), f"safe rule {rule_id} did not fire"


def test_every_lossy_rule_fires_when_opted_in():
    for rule_id, fixture in LOSSY_FIXTURES.items():
        assert rule_id in fired(fixture, include_lossy=True), f"lossy rule {rule_id} did not fire"


def test_lossy_rules_do_not_fire_by_default():
    # Intensifiers/hedges change nuance — they must be off unless explicitly enabled.
    out, _ = apply_compression_rules("This is basically very good, I think.")
    assert "basically" in out
    assert "very" in out
    assert "I think" in out


def test_famous_example_safe_then_lossy():
    text = "Hi! I was wondering if you could basically help me… Thanks in advance!"
    safe_out, _ = apply_compression_rules(text)
    assert "Please" in safe_out
    assert "Thanks" not in safe_out
    assert "basically" in safe_out  # intensifier survives the safe pass
    lossy_out, _ = apply_compression_rules(text, include_lossy=True)
    assert "basically" not in lossy_out


def test_protects_quotes_and_code():
    out, _ = apply_compression_rules(
        'Drop basically here but "keep basically inside" and `code basically`.',
        include_lossy=True,
    )
    assert '"keep basically inside"' in out  # double-quoted span untouched
    assert "`code basically`" in out  # inline code untouched
    assert "Drop here" in out  # the unquoted intensifier was removed

    fence = "```\nx = 1  # basically\n```"
    assert fence in apply_compression_rules(f"basically do it.\n\n{fence}", include_lossy=True)[0]


def test_empty_string():
    assert apply_compression_rules("") == ("", [])
