// src/ui/knobs.ts

export interface Knob {
  set: (v01: number) => void;      // 0..1
  getPhase: () => number;          // 0..1
  destroy: () => void;             // 리스너 해제
}

export interface MakeKnobOptions {
  /** 드래그 감도(픽셀). 값이 클수록 둔감해짐 */
  pixelsPerUnit?: number; // default 300
  /** 초기값(0..1) */
  initial?: number;       // default 0
  /** 표시 포맷 */
  format?: (v01: number) => string; // default v.toFixed(2)
}

/**
 * Pointer drag 기반 knob.
 * el이 null이면 크래시 방지를 위해 더미 knob를 반환합니다.
 */
export function makeKnob(
  el: HTMLElement | null,
  onChange: (phase01: number) => void,
  opts: MakeKnobOptions = {}
): Knob {
  if (!el) {
    // uiManager.js와 동일한 동작: null이면 no-op knob 반환 :contentReference[oaicite:2]{index=2}
    return { set: () => {}, getPhase: () => 0, destroy: () => {} };
  }

  const pixelsPerUnit = opts.pixelsPerUnit ?? 300;
  const format = opts.format ?? ((v: number) => v.toFixed(2));

  let startY: number | null = null;
  let startPhase = 0;
  let phase = clamp01(opts.initial ?? 0);

  el.textContent = format(phase);

  const setPhase = (p: number) => {
    phase = clamp01(p);
    el.textContent = format(phase);
    onChange(phase);
  };

  const onPointerDown = (e: PointerEvent) => {
    startY = e.clientY;
    startPhase = phase;
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (startY === null) return;
    const dy = startY - e.clientY;
    const delta = dy / pixelsPerUnit;
    setPhase(startPhase + delta);
  };

  const onPointerUp = () => {
    startY = null;
  };

  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerUp);

  return {
    set: setPhase,
    getPhase: () => phase,
    destroy: () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    },
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}