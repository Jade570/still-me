export function bindWheel(opts: {
  isEnabled: () => boolean;                 // controls 화면인지 + audioEngineReady인지
  getCurrent: () => number;                 // engine.getMasterHz01
  setNext: (v01: number) => void;           // engine.setMasterHz01
}) {
  document.addEventListener("wheel", (e) => {
    if (!opts.isEnabled()) return;
    e.preventDefault();

    const cur = opts.getCurrent();
    const delta = (e as WheelEvent).deltaY > 0 ? -0.01 : 0.01;
    const next = Math.max(0, Math.min(1, cur + delta));
    if (next !== cur) opts.setNext(next);
  }, { passive: false });
}