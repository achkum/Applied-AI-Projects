import type { ClassificationResult, TriageTier } from "@/lib/types";

const TIER: Record<TriageTier, { label: string; className: string }> = {
  confident_benign: { label: "Confident · Benign", className: "bg-emerald-50 text-emerald-700" },
  uncertain_review: {
    label: "Uncertain · Recommend human review",
    className: "bg-amber-50 text-amber-800",
  },
  confident_malignant: { label: "Confident · Malignant", className: "bg-rose-50 text-rose-700" },
};

export function PredictionCard({ result }: { result: ClassificationResult }) {
  const pct = Math.round(result.confidence * 100);
  const malignant = result.class === "malignant";
  const tier = TIER[result.tier];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Model prediction
      </h2>
      <p
        className={`mt-1 text-2xl font-semibold ${malignant ? "text-rose-700" : "text-emerald-700"}`}
      >
        {result.class[0].toUpperCase() + result.class.slice(1)}
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Confidence</span>
          <span className="font-medium tabular-nums">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Model confidence"
          className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        >
          {/* Inline width is the standard way to render a runtime-driven progress value. */}
          <div
            className={`h-2 rounded-full ${malignant ? "bg-rose-600" : "bg-emerald-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <span
        className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-medium ${tier.className}`}
      >
        {tier.label}
      </span>
    </div>
  );
}
