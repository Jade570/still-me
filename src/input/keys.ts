export function bindKeys(opts: {
  canHandle: () => boolean;                 // controls 화면 표시 중인지
  showScreen: (n: 1|2|3) => void;
  resetCamera: () => void;
  spotlightNext: () => void;                // activeSeats 계산/전환은 여기로 숨김
  panic: () => void;
  isSpotlightActive: () => boolean;
}) {
  document.addEventListener("keydown", (e) => {
    if (!opts.canHandle()) return;

    if ((e.key === "1" || e.key === "3") && opts.isSpotlightActive()) {
      opts.resetCamera();
    }

    if (e.key === "1") opts.showScreen(1);
    else if (e.key === "2") opts.showScreen(2);
    else if (e.key === "3") opts.showScreen(3);
    else if (e.key === "a") opts.spotlightNext();
    else if (e.key === "p") opts.panic();
  });
}