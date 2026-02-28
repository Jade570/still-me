// audio/modules/waves.ts
import { DEFAULT_PARAMS } from "../engine/params";

type Kind = "sin" | "saw" | "tri";

function basisSpectrum(kind: Kind, n: number) {
  if (kind === "sin") return n === 1 ? 1 : 0;
  if (kind === "saw") return 2 / (n * Math.PI);
  if (kind === "tri") {
    if (n % 2 === 1) {
      const amp = (8 / (Math.PI ** 2)) * (1 / (n ** 2));
      const sign = n % 4 === 1 ? 1 : -1;
      return amp * sign;
    }
    return 0;
  }
  return 0;
}

export interface WavesModule {
  periodicWaveFromPhase(phase01: number): PeriodicWave;
  dispose(): void;
}

export function createWaves(ctx: AudioContext, H = DEFAULT_PARAMS.H): WavesModule {
  const cache = new Map<string, PeriodicWave>();

  function morphTwo(kindA: Kind, kindB: Kind, t: number) {
    const key = `${kindA}-${kindB}-${Math.round(t * 1000)}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const real = new Float32Array(H + 1);
    const imag = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) {
      const a = basisSpectrum(kindA, n);
      const b = basisSpectrum(kindB, n);
      imag[n] = (1 - t) * a + t * b;
    }
    const w = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    cache.set(key, w);
    return w;
  }

  function periodicWaveFromPhase(phase01: number) {
    const p = ((phase01 % 1) + 1) % 1;
    if (p < 0.5) return morphTwo("sin", "saw", p * 2);
    return morphTwo("saw", "tri", (p - 0.5) * 2);
  }

  function dispose() {
    cache.clear();
  }

  return { periodicWaveFromPhase, dispose };
}