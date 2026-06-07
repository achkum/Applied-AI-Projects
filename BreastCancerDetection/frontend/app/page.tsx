"use client";

import { track } from "@vercel/analytics";
import { Activity, AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { HeatmapToggle } from "@/components/HeatmapToggle";
import { IntroPanel } from "@/components/IntroPanel";
import { PredictionCard } from "@/components/PredictionCard";
import { UploadSlide } from "@/components/UploadSlide";
import { classifySlide, fileToBase64, generateHeatmap } from "@/lib/api";
import type { ClassificationResult, HeatmapResult } from "@/lib/types";

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<ClassificationResult | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(file: File) {
    setError(null);
    setPrediction(null);
    setHeatmap(null);
    setLoading(true);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    try {
      const [result, b64] = await Promise.all([classifySlide(file), fileToBase64(file)]);
      setPrediction(result);
      setImageBase64(b64);
      track("prediction_run", { result: result.class, tier: result.tier });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not classify the slide.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestHeatmap() {
    if (!imageBase64) return;
    setHeatmapLoading(true);
    try {
      setHeatmap(await generateHeatmap(imageBase64));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the heatmap.");
    } finally {
      setHeatmapLoading(false);
    }
  }

  function handleClear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileName(null);
    setImageBase64(null);
    setPrediction(null);
    setHeatmap(null);
    setError(null);
  }

  const status = loading ? "Analyzing" : prediction ? "Complete" : previewUrl ? "Ready" : "Idle";

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-[84px] lg:self-start">
        <UploadSlide
          onSelect={handleSelect}
          disabled={loading}
          previewUrl={previewUrl}
          fileName={fileName}
          onClear={handleClear}
        />
        <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-surface px-5 py-3">
          <span className="flex items-center gap-2">
            <Activity size={14} strokeWidth={1.75} className="text-accent" />
            <span className="label-mono">Pipeline</span>
          </span>
          <span className="flex items-center gap-2 font-mono text-[0.72rem] text-fg">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                loading ? "animate-pulse bg-uncertain" : prediction ? "bg-benign" : "bg-fg-faint"
              }`}
            />
            {status}
          </span>
        </div>
      </aside>

      <section className="min-w-0 space-y-5">
        {error && (
          <div
            role="alert"
            className="animate-fade-in flex items-start gap-3 rounded-xl border border-malignant/30 bg-malignant/[0.1] px-4 py-4"
          >
            <AlertCircle size={18} strokeWidth={1.9} className="mt-0.5 shrink-0 text-malignant" />
            <div>
              <p className="text-sm font-semibold text-malignant">Could not analyze this image</p>
              <p className="mt-1 text-[0.86rem] leading-relaxed text-fg-muted">{error}</p>
            </div>
          </div>
        )}

        {!prediction && !loading && <IntroPanel />}

        {loading && (
          <div className="animate-fade-in flex flex-col items-center rounded-xl border border-white/[0.07] bg-surface p-12 text-center">
            <Loader2 size={28} className="animate-spin text-accent" />
            <p className="mt-4 font-mono text-sm uppercase tracking-[0.18em] text-accent">Running the model</p>
            <p className="mt-2 text-sm text-fg-muted">Classifying the specimen and preparing results.</p>
          </div>
        )}

        {prediction && previewUrl && (
          <div className="space-y-5">
            <div className="animate-fade-up grid gap-5 md:grid-cols-2">
              <PredictionCard result={prediction} />
              <HeatmapToggle
                originalSrc={previewUrl}
                heatmap={heatmap}
                loading={heatmapLoading}
                onRequestHeatmap={handleRequestHeatmap}
              />
            </div>
            <div className="animate-fade-up">
              <ChatPanel imageBase64={imageBase64} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
