// src/ui/view.ts

import type { DomRefs } from "./dom";

export type OverlayMode = "start" | "waiting" | "controls";

export function setOverlay(dom: DomRefs, mode: OverlayMode) {
  dom.startContainer.style.display = mode === "start" ? "block" : "none";
  dom.waitingContainer.style.display = mode === "waiting" ? "flex" : "none";
  dom.controlsContainer.style.display = mode === "controls" ? "flex" : "none";

  // Cursor policy: start/waiting need cursor, controls and 이후에는 숨김
  document.body.style.cursor = (mode === "start" || mode === "waiting") ? "auto" : "none";
}
