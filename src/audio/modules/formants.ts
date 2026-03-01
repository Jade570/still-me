// audio/modules/formants.ts
import type { Vowel } from "../engine/types";
import { DEFAULT_PARAMS } from "../engine/params";

export interface FormantBank {
  bp: BiquadFilterNode;
  g: GainNode;
}

export interface FormantsModule {
  formants: FormantBank[];
  formantSum: GainNode;
  amGain: GainNode;

  getFormants(): FormantBank[];
  getCurrentVowel(): Vowel;
  getVowelRampState(now: number): { from: Vowel; to: Vowel; startTime: number; duration: number; now: number };

  setVowel(v: Vowel): void;
  smoothToVowel(v: Vowel, durSec?: number): void;

  setFormantQ(i: 0 | 1 | 2, Q: number): void;
  setFormantBaseGain01(i: 0 | 1 | 2, v01: number): void;
  setFormantDetuneHz(i: 0 | 1 | 2, dHz: number): void;

  dispose(): void;
}

export function createFormants(ctx: AudioContext, inBus: AudioNode): FormantsModule {
  const VOWELS = DEFAULT_PARAMS.formants.VOWELS;
  let targetVowel: Vowel = DEFAULT_PARAMS.formants.defaultVowel;
  let vowelRamp = { from: targetVowel, to: targetVowel, startTime: 0, duration: 0 };

  const fDetuneHz: [number, number, number] = [0, 0, 0];
  const baseGain01: [number, number, number] = [...DEFAULT_PARAMS.formants.defaultGains];
  const formants: FormantBank[] = [0, 1, 2].map(() => ({
    bp: ctx.createBiquadFilter(),
    g: ctx.createGain(),
  }));

  formants.forEach((f) => {
    f.bp.type = "bandpass";
    f.bp.Q.value = DEFAULT_PARAMS.formants.defaultQ;
    f.g.gain.value = 0.8;
  });

  const formantSum = ctx.createGain();
  formantSum.gain.value = 1.0;

  // routing: inBus -> each bp -> g -> sum
  formants.forEach((f) => {
    inBus.connect(f.bp);
    f.bp.connect(f.g);
    f.g.connect(formantSum);
  });

  // AM stage (LFO 모듈에서 gain param을 건드리도록 노출)
  const amGain = ctx.createGain();
  amGain.gain.value = 1.0;
  formantSum.connect(amGain);

  function applyVowelInstant(v: Vowel) {
    const [f1, f2, f3] = VOWELS[v];
    vowelRamp = { from: v, to: v, startTime: ctx.currentTime, duration: 0 };
    formants[0].bp.frequency.value = f1 + fDetuneHz[0];
    formants[1].bp.frequency.value = f2 + fDetuneHz[1];
    formants[2].bp.frequency.value = f3 + fDetuneHz[2];
    targetVowel = v;
  }

  function setVowel(v: Vowel) {
    applyVowelInstant(v);
  }

  function smoothToVowel(v: Vowel, durSec = 0.8) {
    const now = ctx.currentTime;
    const [t1, t2, t3] = VOWELS[v];
    const curF1 = formants[0].bp.frequency.value;
    const curF2 = formants[1].bp.frequency.value;
    const curF3 = formants[2].bp.frequency.value;

    vowelRamp = { from: targetVowel, to: v, startTime: now, duration: durSec };

    formants.forEach((f) => f.bp.frequency.cancelScheduledValues(now));
    formants[0].bp.frequency.setValueAtTime(curF1, now);
    formants[1].bp.frequency.setValueAtTime(curF2, now);
    formants[2].bp.frequency.setValueAtTime(curF3, now);

    formants[0].bp.frequency.linearRampToValueAtTime(t1 + fDetuneHz[0], now + durSec);
    formants[1].bp.frequency.linearRampToValueAtTime(t2 + fDetuneHz[1], now + durSec);
    formants[2].bp.frequency.linearRampToValueAtTime(t3 + fDetuneHz[2], now + durSec);

    targetVowel = v;
  }

  function setFormantQ(i: 0 | 1 | 2, Q: number) {
    formants[i].bp.Q.value = Q;
  }
  function setFormantBaseGain01(i: 0 | 1 | 2, v01: number) {
    baseGain01[i] = v01;
  }
  function setFormantDetuneHz(i: 0 | 1 | 2, dHz: number) {
    fDetuneHz[i] = dHz;
    // 현재 타겟 모음 기준으로 즉시 반영
    const [f1, f2, f3] = VOWELS[targetVowel];
    formants[0].bp.frequency.value = f1 + fDetuneHz[0];
    formants[1].bp.frequency.value = f2 + fDetuneHz[1];
    formants[2].bp.frequency.value = f3 + fDetuneHz[2];
  }

  function getFormants() {
    return formants;
  }

  function getCurrentVowel() {
    return targetVowel;
  }

  function getVowelRampState(now: number) {
    return { ...vowelRamp, now };
  }

  function dispose() {
    // disconnect handled upstream; minimal cleanup here
  }

  // 초기값 적용
  applyVowelInstant(targetVowel);

  return {
    formants,
    formantSum,
    amGain,
    getFormants,
    getCurrentVowel,
    getVowelRampState,
    setVowel,
    smoothToVowel,
    setFormantQ,
    setFormantBaseGain01,
    setFormantDetuneHz,
    dispose,
  };
}