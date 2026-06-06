import {
  AlertTriangle,
  CircleAlert,
  Eye,
  type LucideIcon,
  Network,
  ScanLine,
  ShieldCheck,
  Upload,
} from "lucide-react";

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Upload, title: "Upload", body: "An H&E slide patch (400X), or a preset." },
  { icon: ScanLine, title: "Classify", body: "ResNet50 returns P(malignant) + a triage tier." },
  { icon: Eye, title: "Explain", body: "Grad-CAM maps the regions behind the score." },
];

const TIERS: { icon: LucideIcon; text: string; label: string }[] = [
  { icon: ShieldCheck, text: "text-benign", label: "Benign" },
  { icon: CircleAlert, text: "text-uncertain", label: "Uncertain" },
  { icon: AlertTriangle, text: "text-malignant", label: "Malignant" },
];

const STACK = ["ResNet50", "PyTorch", "Grad-CAM", "FastAPI", "MCP", "Gemini 2.5 Flash", "Cloud Run", "Vercel"];

export function IntroPanel() {
  return (
    <div className="animate-fade-up space-y-5">
      <section>
        <span className="label-mono">Breast histopathology classification</span>
        <h1 className="mt-2 font-serif text-[1.95rem] font-medium leading-tight text-fg sm:text-[2.15rem]">
          Detecting breast cancer from histopathology slides.
        </h1>
        <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-fg-muted">
          Upload an H&amp;E slide to get a benign or malignant prediction, a Grad-CAM explanation, and a
          chat assistant for follow-ups. A second read for pathologists, not a replacement.
        </p>
      </section>

      <section className="rounded-xl border border-white/[0.07] bg-surface p-5">
        <span className="label-mono">How it works</span>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.title} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                <s.icon size={17} strokeWidth={1.75} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-fg">{s.title}</h3>
                <p className="mt-0.5 text-[0.8rem] leading-snug text-fg-muted">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.07] bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="label-mono">Triage bands</span>
          <div className="flex gap-2">
            {TIERS.map((t) => (
              <span
                key={t.label}
                className={`flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-elevated/60 px-2.5 py-1 text-xs font-medium ${t.text}`}
              >
                <t.icon size={13} strokeWidth={2} />
                {t.label}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[0.8rem] leading-relaxed text-fg-muted">
          Cases near the decision threshold are flagged <span className="text-uncertain">Uncertain</span> for
          human review rather than forced into a call.
        </p>
      </section>

      <section className="rounded-xl border border-accent/20 bg-accent/[0.05] p-5">
        <div className="flex items-start gap-3">
          <Network size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[0.82rem] leading-relaxed text-fg-muted">
            <span className="font-medium text-fg">Interoperable.</span> The classifier and Grad-CAM are
            exposed as an MCP server, so the same tools can plug into a wider CDSS or any MCP-aware agent,
            not just this UI.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STACK.map((s) => (
            <span
              key={s}
              className="rounded border border-white/[0.08] bg-elevated/60 px-2 py-0.5 font-mono text-[0.66rem] text-fg-muted"
            >
              {s}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
