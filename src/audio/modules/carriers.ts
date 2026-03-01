// audio/modules/carriers.ts
import type { WavesModule } from "./waves";
import { DEFAULT_PARAMS, clamp01, centsFromHz, expoMap01, mapGain, mapDetuneHz } from "../engine/params";

export interface CarrierVoice {
  osc: OscillatorNode;
  g: GainNode;
  panner: StereoPannerNode;
  phase01: number;
}

export interface CarriersModule {
  carriers: Array<CarrierVoice | null>;
  detuneHzBySeat: Record<number, number>;

  getMasterHz(): number;
  getMasterHz01(): number;

  setMasterHz01(v01: number): number;
  setPanMap(panMap: number[]): void;

  setCarrierWavePhase(seat: number, phase01: number): void;
  setCarrierGain01(seat: number, gain01: number): void;
  setCarrierDetune01(seat: number, detune01: number, spanHz?: number): void;

  playerRampIn(seat: number): void;
  playerRampOut(seat: number): void;

  dispose(): void;
}

export function createCarriers(ctx: AudioContext, outputBus: AudioNode, waves: WavesModule, panMap: number[]) {
  const seats = DEFAULT_PARAMS.carriers.seats;
  const startSeat = DEFAULT_PARAMS.carriers.startSeat;

  const carriers: Array<CarrierVoice | null> = new Array(seats).fill(null);
  const detuneHzBySeat: Record<number, number> = {};

  let masterHz01: number = DEFAULT_PARAMS.master.defaultHz01;
  let masterHz = expoMap01(masterHz01, DEFAULT_PARAMS.master.minHz, DEFAULT_PARAMS.master.maxHz);

  // defA/defB (고정 2개 voice)
  const defAg = ctx.createGain();
  const defBg = ctx.createGain();
  defAg.gain.value = DEFAULT_PARAMS.carriers.defaultCarrierGainA;
  defBg.gain.value = DEFAULT_PARAMS.carriers.defaultCarrierGainB;

  const defA = ctx.createOscillator();
  const defB = ctx.createOscillator();
  defA.setPeriodicWave(waves.periodicWaveFromPhase(1 / 3));
  defB.setPeriodicWave(waves.periodicWaveFromPhase(1 / 3));
  defA.connect(defAg).connect(outputBus);
  defB.connect(defBg).connect(outputBus);
  defA.start();
  defB.start();

  function seatBaseHz(seat: number) {
    return seat % 3 === 0 ? masterHz * DEFAULT_PARAMS.carriers.subRatio : masterHz;
  }

  function createCarrier(seat: number) {
    if (carriers[seat]) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();

    panner.pan.value = panMap[seat] ?? 0;

    const base = seatBaseHz(seat);
    osc.frequency.value = base;

    const phase01 = 0;
    osc.setPeriodicWave(waves.periodicWaveFromPhase(phase01));

    g.gain.value = 0.0;

    osc.connect(g).connect(panner).connect(outputBus);
    osc.start();

    carriers[seat] = { osc, g, panner, phase01 };
  }

  for (let s = startSeat; s < seats; s++) createCarrier(s);

  function setMasterHz01(v01: number) {
    masterHz01 = clamp01(v01);
    masterHz = expoMap01(masterHz01, DEFAULT_PARAMS.master.minHz, DEFAULT_PARAMS.master.maxHz);

    for (let s = startSeat; s < seats; s++) {
      const c = carriers[s];
      if (!c) continue;
      const base = seatBaseHz(s);
      c.osc.frequency.value = base;

      const dHz = detuneHzBySeat[s] ?? 0;
      c.osc.detune.value = centsFromHz(base, dHz);
    }

    defA.frequency.value = masterHz;
    defB.frequency.value = masterHz * DEFAULT_PARAMS.carriers.subRatio;
    defA.detune.value = centsFromHz(masterHz, -DEFAULT_PARAMS.carriers.defaultDetuneCents);
    defB.detune.value = centsFromHz(masterHz * DEFAULT_PARAMS.carriers.subRatio, +DEFAULT_PARAMS.carriers.defaultDetuneCents);

    return masterHz;
  }

  function setPanMap(next: number[]) {
    panMap = next;
    for (let s = startSeat; s < seats; s++) {
      const c = carriers[s];
      if (!c) continue;
      c.panner.pan.value = panMap[s] ?? 0;
    }
  }

  function setCarrierWavePhase(seat: number, phase01: number) {
    const c = carriers[seat];
    if (!c) return;
    c.osc.setPeriodicWave(waves.periodicWaveFromPhase(phase01));
    c.phase01 = phase01;
  }

  function setCarrierGain01(seat: number, gain01: number) {
    const c = carriers[seat];
    if (!c) return;
    c.g.gain.value = mapGain(gain01, DEFAULT_PARAMS.carriers.perCarrierGainMax);
  }

  function setCarrierDetune01(seat: number, detune01: number, spanHz = 12) {
    const c = carriers[seat];
    if (!c) return;
    const base = seatBaseHz(seat);
    const dHz = mapDetuneHz(detune01, spanHz);
    detuneHzBySeat[seat] = dHz;
    c.osc.detune.value = centsFromHz(base, dHz);
  }

  function playerRampIn(seat: number) {
    const c = carriers[seat];
    if (!c) return;
    const t = ctx.currentTime + 0.01;
    const duration = 0.5;
    const targetGain = DEFAULT_PARAMS.carriers.perCarrierGainMax;

    c.g.gain.cancelScheduledValues(t);
    c.g.gain.setValueAtTime(c.g.gain.value, t);
    c.g.gain.exponentialRampToValueAtTime(Math.max(1e-4, targetGain), t + duration);
  }

  function playerRampOut(seat: number) {
    const c = carriers[seat];
    if (!c) return;
    const t = ctx.currentTime + 0.01;
    const duration = 1.2;
    const target = 1e-4;

    c.g.gain.cancelScheduledValues(t);
    c.g.gain.setValueAtTime(Math.max(1e-4, c.g.gain.value), t);
    c.g.gain.exponentialRampToValueAtTime(target, t + duration);
    c.g.gain.linearRampToValueAtTime(0.0, t + duration + 0.1);
  }

  function getMasterHz() {
    return masterHz;
  }
  function getMasterHz01() {
    return masterHz01;
  }

  function dispose() {
    for (let s = startSeat; s < seats; s++) {
      const c = carriers[s];
      if (!c) continue;
      try {
        c.osc.stop();
      } catch {}
      try {
        c.osc.disconnect();
        c.g.disconnect();
        c.panner.disconnect();
      } catch {}
      carriers[s] = null;
    }
    try {
      defA.stop();
      defB.stop();
    } catch {}
    try {
      defA.disconnect();
      defB.disconnect();
      defAg.disconnect();
      defBg.disconnect();
    } catch {}
  }

  // 초기 마스터 주파수 적용
  setMasterHz01(masterHz01);

  return {
    carriers,
    detuneHzBySeat,
    getMasterHz,
    getMasterHz01,
    setMasterHz01,
    setPanMap,
    setCarrierWavePhase,
    setCarrierGain01,
    setCarrierDetune01,
    playerRampIn,
    playerRampOut,
    dispose,
  } satisfies CarriersModule;
}