// audio/engine/types.ts
export type Vowel = "ㅗ" | "ㅐ" | "ㅕ";
export type SeatIndex = number; // 0..49 (runtime clamp 권장)
export type SliderIndex = 0 | 1 | 2;
export type PercType = 0 | 1 | 2 | 3;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
export {};

export interface EngineInitOptions {
  ctx?: AudioContext;
  destination?: AudioNode; // default: ctx.destination
  panMap?: number[]; // length>=50 권장
}

export interface EngineNodes {
  ctx: AudioContext;
  destination: AudioNode;

  // buses
  mixBus: GainNode;
  fxBus: GainNode;
  master: GainNode;

  // optional taps (필요시 확장)
}

export interface AudioEngine {
  init(opts?: EngineInitOptions): AudioEngine;
  dispose(opts?: { closeContext?: boolean }): void;

  // controls
  setMasterGain(v: number): void; // 0..?
  setMasterHz01(v01: number): number; // returns Hz
  getMasterHz(): number;
  getMasterHz01(): number;

  setPanMap(panMap: number[]): void;

  getCurrentVowel(): Vowel;
  getVowelRampState(): { from: Vowel; to: Vowel; startTime: number; duration: number; now: number };

  setVowel(v: Vowel): void;
  smoothToVowel(v: Vowel, durSec?: number): void;

  onDiceAvg(avg: number): { avg: number; delta: number };
  onSlider(seat: SeatIndex, idx: SliderIndex, val01: number): void;
  onPerc(seat: SeatIndex, val: PercType): void;

  playerRampIn(seat: SeatIndex): void;
  playerRampOut(seat: SeatIndex): void;

  // debug/introspection
  getNodes(): EngineNodes;
}