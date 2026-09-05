import { useEffect, useState } from "react";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.jarvisDesktop?.isMaximized().then((isMax) => {
      setMaximized(isMax);
    }).catch(() => undefined);
  }, []);

  const handleMinimize = () => {
    window.jarvisDesktop?.minimizeWindow();
  };

  const handleMaximize = async () => {
    if (window.jarvisDesktop) {
      const isNowMaximized = await window.jarvisDesktop.maximizeWindow();
      setMaximized(isNowMaximized);
    }
  };

  const handleClose = () => {
    window.jarvisDesktop?.closeWindow();
  };

  return (
    <div className="no-drag window-controls flex items-center gap-1 rounded-full border border-sky-300/30 bg-slate-900/65 p-1 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_20px_rgba(0,0,0,0.3)]">
      {/* Minimize Button */}
      <button
        onClick={handleMinimize}
        title="Minimize"
        className="group relative flex h-7 w-7 items-center justify-center rounded-full text-sky-200 transition-all hover:bg-sky-400/25 hover:text-white active:scale-95"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Maximize / Restore Button */}
      <button
        onClick={handleMaximize}
        title={maximized ? "Restore" : "Maximize"}
        className="group relative flex h-7 w-7 items-center justify-center rounded-full text-sky-200 transition-all hover:bg-sky-400/25 hover:text-white active:scale-95"
      >
        {maximized ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="9" width="10" height="10" rx="1" />
            <path d="M9 5h9a1 1 0 0 1 1 1v9" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="5" width="14" height="14" rx="1" />
          </svg>
        )}
      </button>

      {/* Close / Cut Button */}
      <button
        onClick={handleClose}
        title="Close"
        className="group relative flex h-7 w-7 items-center justify-center rounded-full text-sky-200 transition-all hover:bg-rose-500/90 hover:text-white active:scale-95 shadow-sm"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
