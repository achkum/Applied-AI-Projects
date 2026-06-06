export function Disclaimer() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-uncertain/20 bg-uncertain/[0.06] px-4 py-3"
    >
      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-uncertain" aria-hidden="true" />
      <p className="text-[0.82rem] leading-relaxed text-fg-muted">
        <span className="font-semibold text-uncertain">Research prototype — not a diagnostic device.</span>{" "}
        This tool provides AI-assisted decision support only. Every prediction must be interpreted by
        a qualified pathologist alongside other clinical evidence. No patient data is stored.
      </p>
    </div>
  );
}
