import { AlertTriangle, CircleHelp, ShieldCheck } from "lucide-react";

import type { ClassificationResult, TriageTier } from "@/lib/types";

const TIER: Record<TriageTier, { label: string; dot: string; text: string }> = {
  confident_benign: { label: "Confident · Benign", dot: "bg-benign", text: "text-benign" },
  uncertain_review: { label: "Uncertain · Review", dot: "bg-uncertain", text: "text-uncertain" },
  confident_malignant: { label: "Confident · Malignant", dot: "bg-malignant", text: "text-malignant" },
};

export function PredictionCard({ result }: { result: ClassificationResult }) {
  const tier = TIER[result.tier];
  const uncertain = result.tier === "uncertain_review";
  const malignant = result.class === "malignant";

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface p-6">
      <div className="flex items-start justify-between">
        <span className="label-mono">Prediction</span>
        <span className={`flex items-center gap-2 rounded-full px-2.5 py-1 ${tier.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${tier.dot}`} />
          <span className="font-mono text-[0.66rem] uppercase tracking-[0.14em]">{tier.label}</span>
        </span>
      </div>

      {uncertain ? (
        <UncertainBody result={result} />
      ) : (
        <ConfidentBody result={result} malignant={malignant} />
      )}

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.04]">
        <Readout label="P(malignant)" value={result.probability_malignant.toFixed(4)} />
        <Readout label="Prediction ID" value={result.prediction_id.slice(0, 8)} />
      </div>
    </div>
  );
}

function ConfidentBody({ result, malignant }: { result: ClassificationResult; malignant: boolean }) {
  const pct = Math.round(result.confidence * 100);
  const accentText = malignant ? "text-malignant" : "text-benign";
  const accentBg = malignant ? "bg-malignant" : "bg-benign";

  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${malignant ? "bg-malignant/10" : "bg-benign/10"} ${accentText}`}>
          {malignant ? <AlertTriangle size={22} strokeWidth={1.75} /> : <ShieldCheck size={22} strokeWidth={1.75} />}
        </span>
        <p className={`font-serif text-4xl font-medium ${accentText}`}>
          {result.class[0].toUpperCase() + result.class.slice(1)}
        </p>
      </div>

      <div className="mt-5">
        <div className="flex items-end justify-between">
          <span className="label-mono">Confidence</span>
          <span className="font-mono text-sm tabular-nums text-fg">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Model confidence"
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
        >
          {/* Inline width renders the runtime-driven confidence value. */}
          <div className={`h-full rounded-full ${accentBg}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </>
  );
}

function UncertainBody({ result }: { result: ClassificationResult }) {
  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-uncertain/10 text-uncertain">
          <CircleHelp size={22} strokeWidth={1.75} />
        </span>
        <p className="font-serif text-4xl font-medium text-uncertain">Uncertain</p>
      </div>

      <p className="mt-4 rounded-lg border border-uncertain/20 bg-uncertain/[0.06] px-4 py-3 text-[0.84rem] leading-relaxed text-fg-muted">
        The model is not confident either way — P(malignant) ≈ {result.probability_malignant.toFixed(2)},
        inside its uncertainty band. This case is flagged for{" "}
        <span className="font-medium text-fg">pathologist review</span>. You can also re-run on another
        field of view or magnification to re-assess.
      </p>
    </>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <p className="label-mono">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-fg">{value}</p>
    </div>
  );
}
