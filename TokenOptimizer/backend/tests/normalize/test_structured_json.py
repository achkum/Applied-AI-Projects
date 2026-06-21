import json

from tokenoptim.normalize.structured import JsonYamlNormalizer

NORM = JsonYamlNormalizer()
MODEL = "gpt-4o"


def test_supports():
    assert NORM.supports("a.json")
    assert NORM.supports("b.yaml")
    assert NORM.supports("c.yml")
    assert not NORM.supports("d.csv")


def test_pretty_json_shrinks_and_is_value_identical():
    original = json.dumps({"name": "alice", "items": [1, 2, 3], "nested": {"a": 1}}, indent=4)
    res = NORM.normalize(original, "x.json", MODEL)
    assert len(res.text) < len(original)
    assert res.guarantee == "value-identical"
    assert json.loads(res.text) == json.loads(original)
    assert any(c.kind == "minify_json" for c in res.changes)


def test_invalid_json_passes_through():
    bad = "{not valid json,,,"
    res = NORM.normalize(bad, "x.json", MODEL)
    assert res.text == bad
    assert res.changes == []


def test_yaml_converts_to_json():
    src = "name: alice\nitems:\n  - 1\n  - 2\n"
    res = NORM.normalize(src, "x.yaml", MODEL)
    assert json.loads(res.text) == {"name": "alice", "items": [1, 2]}
    assert any(c.kind == "yaml_to_json" for c in res.changes)


def test_key_dictionary_applied_and_reversible():
    # 12 records each with a long, token-expensive repeated key (>=12 chars, >=10 occurrences).
    key = "very_long_descriptive_metadata_attribute_name"
    records = [{key: f"value number {i}"} for i in range(12)]
    original = json.dumps(records)
    res = NORM.normalize(original, "x.json", MODEL)
    assert any(c.kind == "key_dictionary" for c in res.changes)
    assert res.text.startswith("KEYMAP: ")

    header, body = res.text.split("\n", 1)
    keymap = json.loads(header[len("KEYMAP: ") :])
    restored = json.loads(body)
    # Reverse the aliasing and confirm value-identity with the original.
    rebuilt = [{keymap.get(k, k): v for k, v in obj.items()} for obj in restored]
    assert rebuilt == records


def test_key_dictionary_skipped_when_not_beneficial():
    # Short keys / few records: no key qualifies, so no KEYMAP header.
    res = NORM.normalize(json.dumps([{"a": 1}, {"a": 2}]), "x.json", MODEL)
    assert not res.text.startswith("KEYMAP")
    assert not any(c.kind == "key_dictionary" for c in res.changes)
