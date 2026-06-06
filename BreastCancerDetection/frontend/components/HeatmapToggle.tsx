"use client";

import { Image as ImageIcon, Layers } from "lucide-react";
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

  function select(next: boolean) {
    setShowHeatmap(next);
    if (next && !heatmap && !loading) onRequestHeatmap();
  }

  const showingOverlay = showHeatmap && heatmap !== null;
  const src = showingOverlay ? `data:image/png;base64,${heatmap.heatmap_base64}` : originalSrc;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface p-6">
      <div className="flex justify-end">
        <div className="flex rounded-md border border-white/[0.08] p-0.5">
          <Segment active={!showHeatmap} onClick={() => select(false)}>
            <ImageIcon size={13} strokeWidth={2} /> Original
          </Segment>
          <Segment active={showHeatmap} onClick={() => select(true)}>
            <Layers size={13} strokeWidth={2} /> Grad-CAM
          </Segment>
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-lg border border-white/[0.08] bg-black/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={showingOverlay ? "Grad-CAM heatmap overlay of the slide" : "Uploaded histopathology slide"}
          className="block aspect-square w-full object-cover"
        />
        <CornerBrackets />
        <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-accent backdrop-blur-sm">
          {showingOverlay ? "Grad-CAM" : "Original"}
        </span>
        {showHeatmap && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Computing attention
            </span>
          </div>
        )}
      </div>

      {showingOverlay && (
        <p className="mt-3 text-[0.84rem] leading-relaxed text-fg-muted">{heatmap.attention_summary}</p>
      )}
    </div>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1 font-mono text-[0.68rem] uppercase tracking-wider transition-colors ${
        active ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function CornerBrackets() {
  const base = "absolute h-4 w-4 border-accent/60";
  return (
    <>
      <span className={`${base} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${base} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${base} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${base} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}
