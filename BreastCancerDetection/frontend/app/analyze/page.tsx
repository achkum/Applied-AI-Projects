"use client";

import { useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { HeatmapToggle } from "@/components/HeatmapToggle";
import { PredictionCard } from "@/components/PredictionCard";
import { UploadSlide } from "@/components/UploadSlide";
import { classifySlide, fileToBase64, generateHeatmap } from "@/lib/api";
import type { ClassificationResult, HeatmapResult } from "@/lib/types";

export default function AnalyzePage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
    try {
      const [result, b64] = await Promise.all([classifySlide(file), fileToBase64(file)]);
      setPrediction(result);
      setImageBase64(b64);
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-blue-900">Analyze a slide</h1>

      <UploadSlide onSelect={handleSelect} disabled={loading} />

      {error && (
        <p role="alert" className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-slate-500">Running the model…</p>}

      {previewUrl && prediction && (
        <div className="grid gap-6 md:grid-cols-2">
          <HeatmapToggle
            originalSrc={previewUrl}
            heatmap={heatmap}
            loading={heatmapLoading}
            onRequestHeatmap={handleRequestHeatmap}
          />
          <PredictionCard result={prediction} />
        </div>
      )}

      {prediction && <ChatPanel imageBase64={imageBase64} />}
    </div>
  );
}
