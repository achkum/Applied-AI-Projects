import {
  AlertTriangle,
  CircleAlert,
  Eye,
  Layers,
  type LucideIcon,
  MessageSquareText,
  Network,
  ScanLine,
  ShieldCheck,
  Upload,
} from "lucide-react";

const STEPS: { n: string; icon: LucideIcon; title: string; body: string }[] = [
  { n: "01", icon: Upload, title: "Upload", body: "Load a 400X H&E histopathology slide patch — or pick a preset." },
  { n: "02", icon: ScanLine, title: "Classify", body: "A ResNet50 trained on BreaKHis returns P(malignant), confidence, and a triage tier." },
  { n: "03", icon: Eye, title: "Explain", body: "Grad-CAM overlays the tissue regions that drove the malignancy score." },
];

const TIERS: { icon: LucideIcon; dot: string; text: string; name: string; body: string }[] = [
  { icon: ShieldCheck, dot: "bg-benign", text: "text-benign", name: "Confident benign", body: "Probability below the lower band — low suspicion." },
  { icon: CircleAlert, dot: "bg-uncertain", text: "text-uncertain", name: "Uncertain · review", body: "Within ±0.15 of the operating threshold — the model defers to the pathologist." },
  { icon: AlertTriangle, dot: "bg-malignant", text: "text-malignant", name: "Confident malignant", body: "Probability above the upper band — high suspicion." },
];

const STACK = ["ResNet50", "PyTorch", "Grad-CAM", "FastAPI", "MCP server", "Gemini 2.5 Flash", "Cloud Run", "Vercel"];

export function IntroPanel() {
  return (
    <div className="animate-fade-up space-y-8">
      <section>
        <span className="label-mono">AI breast cancer detection · histopathology</span>
        <h1 className="mt-3 font-serif text-3xl font-medium leading-[1.2] text-fg sm:text-[2.4rem]">
          Detecting breast cancer from histopathology — a calibrated second read.
        </h1>
        <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-fg-muted">
          Upload a breast histopathology slide (H&amp;E, 400X) to receive a benign-versus-malignant
          prediction from a ResNet50 model, a Grad-CAM map of the regions driving that prediction, and a
          conversational assistant for follow-up questions. Designed as a second read for qualified
          pathologists — never a replacement for clinical judgement.
        </p>
      </section>

      <section className="rounded-xl border border-white/[0.07] bg-surface p-6">
        <span className="label-mono">Method</span>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="group rounded-lg border border-white/[0.06] bg-elevated/40 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/30 hover:bg-elevated/70"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
                  <s.icon size={18} strokeWidth={1.75} />
                </span>
                <span className="font-mono text-lg font-semibold text-accent/25 transition-colors group-hover:text-accent/50">
                  {s.n}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-fg">{s.title}</h3>
              <p className="mt-1 text-[0.84rem] leading-relaxed text-fg-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.07] bg-surface p-6">
        <span className="label-mono">Triage bands</span>
        <p className="mt-3 text-[0.84rem] leading-relaxed text-fg-muted">
          Predictions are sorted into three decision bands around the operating threshold, so the
          uncertain middle is explicitly flagged for human review rather than forced into a call.
        </p>
        <div className="mt-4 space-y-2.5">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-elevated/50 px-4 py-3 transition-colors hover:border-white/12 hover:bg-elevated/80"
            >
              <t.icon size={18} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${t.text}`} />
              <div>
                <p className="text-sm font-medium text-fg">{t.name}</p>
                <p className="text-[0.82rem] text-fg-muted">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-xl border border-white/[0.07] bg-surface p-6 transition-colors hover:border-white/12">
          <div className="flex items-center gap-2">
            <MessageSquareText size={16} strokeWidth={1.75} className="text-accent" />
            <span className="label-mono">Assistant</span>
          </div>
          <p className="mt-3 text-[0.84rem] leading-relaxed text-fg-muted">
            After a prediction, ask the built-in assistant follow-ups (“why this call?”, “which regions
            are suspicious?”). It answers by calling the same two MCP tools that power the analysis — the
            classifier and the Grad-CAM generator.
          </p>
        </section>

        <section className="rounded-xl border border-white/[0.07] bg-surface p-6 transition-colors hover:border-white/12">
          <div className="flex items-center gap-2">
            <Layers size={16} strokeWidth={1.75} className="text-accent" />
            <span className="label-mono">Built with</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STACK.map((s) => (
              <span
                key={s}
                className="rounded-md border border-white/[0.08] bg-elevated/60 px-2.5 py-1 font-mono text-[0.7rem] text-fg-muted transition-colors hover:border-accent/40 hover:text-fg"
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] p-5 transition-colors hover:border-accent/35">
        <Network size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-[0.84rem] leading-relaxed text-fg-muted">
          <span className="font-medium text-fg">Interoperable by design.</span> The classifier and
          Grad-CAM generator are published as a Model Context Protocol (MCP) server, so the same tools
          this page uses can be wired into a larger clinical decision support system (CDSS) or driven by
          any MCP-aware agent — e.g. Claude Desktop — not just this interface.
        </p>
      </section>
    </div>
  );
}
