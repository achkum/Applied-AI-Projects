"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onSelect: (file: File) => void;
  disabled?: boolean;
};

export function UploadSlide({ onSelect, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [examples, setExamples] = useState<Record<string, string>>({});

  // Preset demo slides are dropped into public/examples/ with a labels.json manifest.
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

  async function pickExample(name: string) {
    const res = await fetch(`/examples/${name}`);
    const blob = await res.blob();
    onSelect(new File([blob], name, { type: blob.type || "image/png" }));
  }

  const exampleNames = Object.keys(examples);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <label htmlFor="slide-upload" className="block text-sm font-medium text-slate-700">
        Upload a histopathology slide (PNG or JPEG)
      </label>
      <input
        id="slide-upload"
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        disabled={disabled}
        onChange={handleInput}
        className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-blue-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-800 disabled:opacity-50"
      />

      {exampleNames.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Or try an example slide
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {exampleNames.map((name) => (
              <button
                key={name}
                type="button"
                disabled={disabled}
                onClick={() => pickExample(name)}
                className="group overflow-hidden rounded-md border border-slate-200 hover:border-blue-900 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/examples/${name}`}
                  alt={`Example slide labelled ${examples[name]}`}
                  className="block h-20 w-full object-cover"
                />
                <span className="block py-1 text-center text-xs capitalize text-slate-600">
                  {examples[name]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
