export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-base/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-3.5 sm:px-8">
        {/* Plain anchor (not next/link) so it does a full load and resets the single-page state. */}
        <a href="/" aria-label="Go to home" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <SpecimenMark />
          <div className="leading-none">
            <span className="text-[0.98rem] font-semibold tracking-tight text-fg">
              AI Breast Cancer <span className="text-accent">Detector</span>
            </span>
            <p className="mt-1 hidden font-mono text-[0.64rem] uppercase tracking-[0.16em] text-fg-faint sm:block">
              Histopathology decision support
            </p>
          </div>
        </a>

        <div className="flex items-center gap-2 rounded-full border border-uncertain/25 bg-uncertain/[0.08] px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-uncertain" />
          <span className="font-mono text-[0.66rem] uppercase tracking-[0.16em] text-uncertain">
            Research use, not for diagnosis
          </span>
        </div>
      </div>
    </header>
  );
}

function SpecimenMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="7" stroke="rgba(52,214,198,0.35)" />
      <circle cx="15" cy="15" r="8.5" stroke="rgba(52,214,198,0.5)" />
      <circle cx="15" cy="15" r="3.4" fill="#34d6c6" fillOpacity="0.85" />
      <circle cx="20" cy="11" r="1.5" fill="#34d6c6" fillOpacity="0.5" />
      <circle cx="10.5" cy="19" r="1.1" fill="#34d6c6" fillOpacity="0.4" />
    </svg>
  );
}
