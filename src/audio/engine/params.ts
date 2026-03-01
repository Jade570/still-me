// audio/engine/params.ts
import type { Vowel } from "./types";

export const DEFAULT_PARAMS = {
  H: 64, // periodic wave harmonics
  master: {
    gain: 0.8,
    minHz: 50,
    maxHz: 1000,
    defaultHz01: 0.35 as number,
  },
  formants: {
    // 선생님 값 그대로
    VOWELS: {
      "ㅗ": [378.4227598, 2697.335103, 3561.798727],
      "ㅐ": [772.5316769, 2168.926062, 3023.776787],
      "ㅕ": [320.6933387, 1496.635645, 2946.250096],
    } satisfies Record<Vowel, [number, number, number]>,
    ring: ["ㅗ", "ㅐ", "ㅕ"] as Vowel[],
    defaultVowel: "ㅗ" as Vowel,
    defaultQ: 5,
    defaultGains: [0.8, 0.8, 0.8] as [number, number, number],
  },
  lfo: {
    defaultHz: 2,
    depthMax: 0.5,
    freqMin: 0.1,
    freqMax: 10.1, // 0.1 + 10
  },
  carriers: {
    seats: 50,
    startSeat: 4,
    // seat%3==0 -> master*(2/3)
    subRatio: 2 / 3,
    perCarrierGainMax: 0.35,
    defaultCarrierGainA: 0.18,
    defaultCarrierGainB: 0.18,
    defaultDetuneCents: 3,
  },
  perc: {
    ampWeight: 0.8,
  },
} as const;

export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function db(dbVal: number) {
  return Math.pow(10, dbVal / 20);
}

export function expoMap01(v01: number, minHz: number, maxHz: number) {
  const r = maxHz / minHz;
  return minHz * Math.pow(r, clamp01(v01));
}

export function centsFromHz(baseHz: number, dHz: number) {
  return 1200 * Math.log2((baseHz + dHz) / baseHz);
}

export function randRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function mapQ(v01: number) {
  return 0.3 + clamp01(v01) * 20;
}

export function mapDetuneHz(v01: number, span: number) {
  return (clamp01(v01) - 0.5) * 2 * span;
}

export function mapGain(v01: number, max = 1) {
  const v = clamp01(v01);
  const curved = v * v; // v^2
  return curved * max;
}

export function qCompensatedGain(Q: number) {
  const minQ = 0.3;
  const maxQ = 20.3;
  const maxG = 1.0;
  const minG = 0.5;
  const normalizedQ = (Q - minQ) / (maxQ - minQ);
  const compensation = maxG - normalizedQ * (maxG - minG);
  return Math.max(minG, Math.min(maxG, compensation));
}