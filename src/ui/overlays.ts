// src/ui/overlays.ts

export interface Overlays {
  urlOverlay: HTMLParagraphElement;
  panicOverlay: HTMLDivElement;
}

export interface PanicDeps {
  getMasterGainNode: () => GainNode | null;
  getAudioContext: () => AudioContext | null;
}

export interface PanicOptions {
  fadeSeconds?: number;     // default 5
  visualFadeSeconds?: number; // default 5
}

/**
 * URL/Panic 오버레이를 "없으면 생성, 있으면 재사용"합니다.
 * (uiManager.js는 무조건 생성 :contentReference[oaicite:3]{index=3})
 */
export function ensureOverlays(parent: HTMLElement = document.body): Overlays {
  const existingUrl = document.getElementById("url-overlay") as HTMLParagraphElement | null;
  const existingPanic = document.getElementById("panic-overlay") as HTMLDivElement | null;

  const urlOverlay = existingUrl ?? createUrlOverlay(parent);
  const panicOverlay = existingPanic ?? createPanicOverlay(parent);

  return { urlOverlay, panicOverlay };
}

export function showURLOverlay(
  urlOverlayEl: HTMLElement | null,
  url: string
) {
  if (!urlOverlayEl) return;
  urlOverlayEl.textContent = url;
  urlOverlayEl.style.cursor = "none";
  urlOverlayEl.style.display = "block";
}

export function hideURLOverlay(urlOverlayEl: HTMLParagraphElement | null) {
  if (!urlOverlayEl) return;
  urlOverlayEl.style.display = "none";
}

/**
 * 오디오 + 비주얼 패닉 페이드.
 * uiManager.js fadePanic 로직 기반 :contentReference[oaicite:5]{index=5}
 */
export function fadePanic(
  panicOverlayEl: HTMLDivElement | null,
  deps: PanicDeps,
  opts: PanicOptions = {}
) {
  const masterGain = deps.getMasterGainNode();
  const audioCtx = deps.getAudioContext();
  const fadeSeconds = opts.fadeSeconds ?? 5.0;
  const visualFadeSeconds = opts.visualFadeSeconds ?? fadeSeconds;

  // 1) audio fade
  if (masterGain && audioCtx) {
    const now = audioCtx.currentTime;
    const end = now + fadeSeconds;
    const target = 0.0001; // exponentialRamp는 0으로 못 감

    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.exponentialRampToValueAtTime(target, end);
    masterGain.gain.linearRampToValueAtTime(0.0, end + 0.1);
  }

  // 2) visual fade
  if (panicOverlayEl) {
    panicOverlayEl.style.transition = `opacity ${visualFadeSeconds}s linear`;
    panicOverlayEl.style.opacity = "1.0";
  }
}

function createUrlOverlay(parent: HTMLElement): HTMLParagraphElement {
  const p = document.createElement("p");
  p.id = "url-overlay";
  parent.appendChild(p);
  return p;
}

function createPanicOverlay(parent: HTMLElement): HTMLDivElement {
  const d = document.createElement("div");
  d.id = "panic-overlay";
  d.style.position = "fixed";
  d.style.top = "0";
  d.style.left = "0";
  d.style.width = "100vw";
  d.style.height = "100vh";
  d.style.backgroundColor = "#000";
  d.style.opacity = "0";
  d.style.pointerEvents = "none";
  d.style.zIndex = "999";
  d.style.transition = "opacity 5s linear";
  parent.appendChild(d);
  return d;
}