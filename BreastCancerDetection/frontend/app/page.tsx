import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold text-blue-900">
          AI-assisted breast histopathology decision support
        </h1>
        <p className="max-w-2xl text-slate-600">
          Upload a breast histopathology slide to receive a benign-versus-malignant prediction from a
          ResNet50 model, a Grad-CAM heatmap of the regions driving that prediction, and a
          conversational assistant for follow-up questions. Built for qualified pathologists as a
          second read — never a replacement for clinical judgement.
        </p>
        <Link
          href="/analyze"
          className="inline-block rounded-md bg-blue-900 px-5 py-2.5 font-medium text-white hover:bg-blue-800"
        >
          Analyze a slide
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Prediction",
            body: "ResNet50 trained on BreaKHis 400X returns class, confidence and a triage tier.",
          },
          {
            title: "Explainability",
            body: "Grad-CAM highlights the tissue regions that drove the malignancy score.",
          },
          {
            title: "Agent (MCP)",
            body: "A Gemini assistant answers follow-ups using the same two MCP tools any client can call.",
          },
        ].map((card) => (
          <div key={card.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-emerald-700">{card.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{card.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
