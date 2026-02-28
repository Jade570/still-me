// audio/modules/perc.ts
import { noiseBuffer, burstBuffer } from "./noise";
import { envADSR, now } from "../engine/scheduler";
import { db, randRange } from "../engine/params";

function bandpass(ctx: AudioContext, f = 1000, Q = 8) {
  const bi = ctx.createBiquadFilter();
  bi.type = "bandpass";
  bi.frequency.value = f;
  bi.Q.value = Q;
  return bi;
}
function notch(ctx: AudioContext, f = 1000, Q = 8) {
  const bi = ctx.createBiquadFilter();
  bi.type = "notch";
  bi.frequency.value = f;
  bi.Q.value = Q;
  return bi;
}
function lowpass(ctx: AudioContext, f = 1000, Q = 8) {
  const bi = ctx.createBiquadFilter();
  bi.type = "lowpass";
  bi.frequency.value = f;
  bi.Q.value = Q;
  return bi;
}

export interface PercModule {
  playFric(opts?: { center?: number; Q?: number; dur?: number; amp?: number; pan?: number }): void;
  playBurst(opts?: { centers?: number[]; dur?: number; amp?: number; burstMs?: number; pan?: number; Q?: number }): void;
  playNasalPerc(center?: number, pan?: number, amp?: number): void;
  playTapR(opts?: { centers?: number[]; dur?: number; amp?: number; burstMs?: number; pan?: number; Q?: number }): void;
  playNg(opts?: {
    base?: number;
    lenMs?: number;
    nasalHz?: number;
    notchHz1?: number;
    notchHz2?: number;
    pan?: number;
    amp?: number;
  }): void;

  dispose(): void;
}

/**
 * 퍼커션은 주로 one-shot이므로 모듈 상태는 거의 없고,
 * outputBus만 받아서 거기로 내보냄.
 */
export function createPerc(ctx: AudioContext, outputBus: AudioNode): PercModule {
  function playFric({ center = 4000, Q = 1.5, dur = 0.12, amp = 1.2, pan = 0.0 } = {}) {
    const t = now(ctx, 0.02);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const bp = bandpass(ctx, center, Q);
    const g = ctx.createGain();
    g.gain.value = 0;

    src.connect(bp).connect(g).connect(panner).connect(outputBus);
    envADSR(g.gain, t, 0.002, dur * 0.75, 0, 0.03, amp);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function playBurst({ centers = [2000], dur = 0.05, amp = 1.5, burstMs = 6, pan = 0.0, Q = 8 } = {}) {
    const t = now(ctx, 0.01);
    const src = ctx.createBufferSource();
    src.buffer = burstBuffer(ctx, burstMs);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g);

    centers.forEach((f) => {
      const bp = bandpass(ctx, f, Q);
      const gg = ctx.createGain();
      gg.gain.value = 1;
      g.connect(bp);
      bp.connect(gg);
      gg.connect(panner);
      panner.connect(outputBus);
    });

    envADSR(g.gain, t, 0.001, dur * 0.8, 0, 0.02, amp);
    src.start(t);
    src.stop(t + dur + burstMs / 1000 + 0.05);
  }

  function playNasalPerc(center = 250, pan = 0.0, amp = 3.0) {
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.03);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const bp = bandpass(ctx, center, 8);
    const g = ctx.createGain();
    g.gain.value = 0;

    src.connect(bp).connect(g).connect(panner).connect(outputBus);
    envADSR(g.gain, t, 0.002, 0.04, 0, 0.02, amp);
    src.start(t);
    src.stop(t + 0.1);
  }

  function playTapR({ centers = [1200, 2000], dur = 0.04, amp = 5.0, burstMs = 5, pan = 0.0, Q = 8 } = {}) {
    const t = now(ctx, 0.01);
    const src = ctx.createBufferSource();
    src.buffer = burstBuffer(ctx, burstMs);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const g = ctx.createGain();
    g.gain.value = db(12);
    src.connect(g);

    centers.forEach((f) => {
      const bp = bandpass(ctx, f, Q);
      const gg = ctx.createGain();
      gg.gain.value = 1;
      g.connect(bp);
      bp.connect(gg);
      gg.connect(panner);
      panner.connect(outputBus);
    });

    envADSR(g.gain, t, 0.001, dur * 0.8, 0, 0.02, amp);
    src.start(t);
    src.stop(t + dur + burstMs / 1000 + 0.05);
  }

  function playNg({
    base = 200,
    lenMs = 70,
    nasalHz = 260,
    notchHz1 = 1500,
    notchHz2 = 3000,
    pan = 0.0,
    amp = 0.5,
  } = {}) {
    const t0 = now(ctx, 0.01);
    const len = Math.max(0.02, lenMs / 1000);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15;
    comp.knee.value = 15;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.08;

    const bp = bandpass(ctx, nasalHz, 3.0);
    const notchA = notch(ctx, notchHz1, 5.0);
    const notchB = notch(ctx, notchHz2, 4.0);
    const lp = lowpass(ctx, 1200, 0.5);

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const env = ctx.createGain();
    env.gain.value = 0;
    envADSR(env.gain, t0, 0.003, len * 0.9, 0.0, 0.03, amp * 11);

    const nSrc = ctx.createBufferSource();
    nSrc.buffer = noiseBuffer(ctx, len);
    const nGain = ctx.createGain();
    nGain.gain.value = 0;
    envADSR(nGain.gain, t0, 0.001, len * 0.85, 0.0, 0.02, amp);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    const baseJitter = base * (1 + randRange(-0.01, 0.01));
    osc.frequency.setValueAtTime(baseJitter, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, baseJitter * 0.92), t0 + len * 0.8);

    const oGain = ctx.createGain();
    oGain.gain.value = 0;
    envADSR(oGain.gain, t0, 0.001, len * 0.95, 0.0, 0.02, amp);

    nSrc.connect(nGain).connect(bp);
    osc.connect(oGain).connect(bp);

    bp.connect(notchA).connect(notchB).connect(lp).connect(env).connect(panner).connect(comp).connect(outputBus);

    nSrc.start(t0);
    osc.start(t0);
    nSrc.stop(t0 + len);
    osc.stop(t0 + len);
  }

  function dispose() {
    // one-shots라 별도 상태 없음
  }

  return { playFric, playBurst, playNasalPerc, playTapR, playNg, dispose };
}