export function Disclaimer() {
  return (
    <div
      role="note"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <span className="font-semibold">Research prototype — not a diagnostic device.</span>{" "}
      This tool provides AI-assisted decision support only. Every prediction must be interpreted by a
      qualified pathologist alongside other clinical evidence. No patient data is stored.
    </div>
  );
}
