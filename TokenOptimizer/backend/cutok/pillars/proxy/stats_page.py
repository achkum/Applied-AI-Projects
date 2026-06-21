"""The one metric, rendered. A self-contained HTML page — the counter, not a dashboard."""

import html

_FEATURE_LABELS = {
    "normalization": "Attachment normalization",
    "cache_optimization": "Cache optimization",
    "compression": "Prompt compression",
    "response_budget": "Response budgeting",
}


def render_stats_html(totals: dict) -> str:
    saved = totals.get("tokens_saved", 0)
    processed = totals.get("tokens_processed", 0)
    calls = totals.get("calls", 0)
    by_feature = totals.get("by_feature", {})

    rows = "".join(
        f"<tr><td>{html.escape(_FEATURE_LABELS.get(k, k))}</td>"
        f"<td class='num'>{v:,}</td></tr>"
        for k, v in sorted(by_feature.items(), key=lambda kv: -kv[1])
    ) or "<tr><td colspan='2' class='muted'>No optimizations yet — send a request through the proxy.</td></tr>"

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Cutok</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: ui-sans-serif, system-ui, sans-serif; max-width: 640px;
          margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }}
  h1 {{ font-size: 1.2rem; font-weight: 600; margin-bottom: 0.25rem; }}
  .hero {{ font-size: 3rem; font-weight: 700; letter-spacing: -0.02em; }}
  .hero small {{ font-size: 1rem; font-weight: 400; opacity: 0.6; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 1.5rem; }}
  td {{ padding: 0.5rem 0; border-bottom: 1px solid rgba(128,128,128,0.2); }}
  .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .muted {{ opacity: 0.6; }}
  .foot {{ margin-top: 2rem; font-size: 0.85rem; opacity: 0.6; }}
</style>
</head>
<body>
  <h1>Cutok</h1>
  <div class="hero">{saved:,} <small>tokens saved this session</small></div>
  <table>
    <tr><td>Tokens processed</td><td class="num">{processed:,}</td></tr>
    <tr><td>Calls optimized</td><td class="num">{calls:,}</td></tr>
  </table>
  <h2 style="font-size:1rem;margin-top:1.5rem;">By feature</h2>
  <table>{rows}</table>
  <p class="foot">Local &amp; lossless-first. Auto-refreshes every 5s.</p>
</body>
</html>"""
