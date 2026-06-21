"""cutok: a local LLM token-reduction engine.

Public library API (add an optimization layer on top of any LLM/agent call):

    import cutok as ts
    req = ts.optimize(model="gpt-4o", messages=[...])      # functional
    create = ts.optimized(client.chat.completions.create)  # wrap any create-callable
    client = ts.wrap(client)                                # drop-in for known SDKs
"""

__version__ = "0.1.0"

from cutok.pillars.lib import (
    configure,
    optimize,
    optimize_file,
    optimize_file_b64,
    optimized,
    reset_savings,
    savings,
    wrap,
)

__all__ = [
    "__version__",
    "configure",
    "optimize",
    "optimize_file",
    "optimize_file_b64",
    "optimized",
    "reset_savings",
    "savings",
    "wrap",
]
