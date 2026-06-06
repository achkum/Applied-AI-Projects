"use client";

import { FlaskConical, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  onSelect: (file: File) => void;
  disabled?: boolean;
  previewUrl: string | null;
  fileName: string | null;
  onClear: () => void;
};

export function UploadSlide({ onSelect, disabled, previewUrl, fileName, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    fetch("/examples/labels.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setExamples)
      .catch(() => setExamples({}));
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onSelect(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) onSelect(file);
  }

  async function pickExample(name: string) {
    const res = await fetch(`/examples/${name}`);
    const blob = await res.blob();
    onSelect(new File([blob], name, { type: blob.type || "image/png" }));
  }

  const exampleNames = Object.keys(examples);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} strokeWidth={1.75} className="text-accent" />
          <span className="label-mono">Specimen intake</span>
        </div>
        <span className="label-mono text-accent/70">01</span>
      </div>

      {previewUrl ? (
        <div className="mt-4">
          <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Loaded histopathology slide" className="block aspect-square w-full object-cover" />
            <CornerBrackets />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-xs text-fg-muted" title={fileName ?? ""}>
              {fileName}
            </span>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-wider text-fg-muted transition-colors hover:border-white/20 hover:text-fg disabled:opacity-50"
            >
              <X size={12} strokeWidth={2.25} /> Clear
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor="slide-upload"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`group mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-10 text-center transition-colors ${
            dragging ? "border-accent bg-accent/[0.05]" : "border-white/12 hover:border-white/25"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110">
            <Upload size={22} strokeWidth={1.75} />
          </span>
          <span className="mt-3 text-sm font-medium text-fg">Drop a slide, or browse</span>
          <span className="mt-1 font-mono text-[0.68rem] uppercase tracking-wider text-fg-faint">
            PNG / JPEG · max 10 MB
          </span>
        </label>
      )}

      <input
        id="slide-upload"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        disabled={disabled}
        onChange={handleInput}
        className="sr-only"
      />

      {exampleNames.length > 0 && (
        <div className="mt-6">
          <span className="label-mono">Preset specimens</span>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {exampleNames.map((name) => (
              <button
                key={name}
                type="button"
                disabled={disabled}
                onClick={() => pickExample(name)}
                title={`Example · ${examples[name]}`}
                className="group relative overflow-hidden rounded-md border border-white/[0.08] transition-colors hover:border-accent/60 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/examples/${name}`}
                  alt={`Example slide labelled ${examples[name]}`}
                  className="block aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span
                  className={`absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full ${
                    examples[name] === "malignant" ? "bg-malignant" : "bg-benign"
                  }`}
                />
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-[0.64rem] text-fg-faint">
            <span className="text-benign">●</span> benign &nbsp; <span className="text-malignant">●</span> malignant
          </p>
        </div>
      )}
    </div>
  );
}

function CornerBrackets() {
  const base = "absolute h-4 w-4 border-accent/70";
  return (
    <>
      <span className={`${base} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${base} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${base} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${base} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  );
}

