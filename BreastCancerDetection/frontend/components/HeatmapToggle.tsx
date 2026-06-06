"use client";

import { useState } from "react";

import type { HeatmapResult } from "@/lib/types";

type Props = {
  originalSrc: string;
  heatmap: HeatmapResult | null;
  loading: boolean;
  onRequestHeatmap: () => void;
};

export function HeatmapToggle({ originalSrc, heatmap, loading, onRequestHeatmap }: Props) {
  const [showHeatmap, setShowHeatmap] = useState(false);

  function toggle() {
    const next = !showHeatmap;
    setShowHeatmap(next);
    if (next && !heatmap && !loading) onRequestHeatmap();
  }

  const showingOverlay = showHeatmap && heatmap !== null;
  const src = showingOverlay
    ? `data:image/png;base64,${heatmap.heatmap_base64}`
    : originalSrc;

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        {/* Object URLs / base64 don't benefit from next/image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={showingOverlay ? "Grad-CAM heatmap overlay of the slide" : "Uploaded histopathology slide"}
          className="block h-auto w-full"
        />
      </div>

      <button
        type="button"
        onClick={toggle}
        className="mt-3 rounded-md border border-blue-900 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-50"
      >
        {showHeatmap ? "Show original slide" : "Show Grad-CAM heatmap"}
      </button>

      {showHeatmap && loading && (
        <p className="mt-2 text-sm text-slate-500">Generating heatmap…</p>
      )}
      {showingOverlay && (
        <p className="mt-2 text-sm text-slate-600">{heatmap.attention_summary}</p>
      )}
    </div>
  );
}
