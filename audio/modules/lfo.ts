// audio/modules/lfo.ts
import type { WavesModule } from "./waves";
import { DEFAULT_PARAMS, clamp01 } from "../engine/params";

export interface LFOModule {
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  dc: ConstantSourceNode;

  setWavePhase(phase01: number): void;
  setDepth01(v01: number): void;
  setFreq01(v01: number): void;

  dispose(): void;
}

/**
 * LFO를 targetParam (보통 amGain.gain)에 연결
 */
export function createLFO(ctx: AudioContext, targetParam: AudioParam, waves: WavesModule): LFOModule {
  const dc = new ConstantSourceNode(ctx, { offset: 1 });
  dc.start();

  const lfo = ctx.createOscillator();
  lfo.frequency.value = DEFAULT_PARAMS.lfo.defaultHz;
  lfo.start();

  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0;

  // lfo -> depth -> targetParam, dc -> targetParam
  lfo.connect(lfoDepth).connect(targetParam);
  dc.connect(targetParam);

  function setWavePhase(phase01: number) {
    lfo.setPeriodicWave(waves.periodicWaveFromPhase(phase01));
  }

  function setDepth01(v01: number) {
    lfoDepth.gain.value = clamp01(v01) * DEFAULT_PARAMS.lfo.depthMax;
  }

  function setFreq01(v01: number) {
    lfo.frequency.value = DEFAULT_PARAMS.lfo.freqMin + clamp01(v01) * (DEFAULT_PARAMS.lfo.freqMax - DEFAULT_PARAMS.lfo.freqMin);
  }

  function dispose() {
    try {
      lfo.disconnect();
      lfoDepth.disconnect();
      dc.disconnect();
    } catch {
      /* noop */
    }
    try {
      lfo.stop();
    } catch {
      /* noop */
    }
    try {
      dc.stop();
    } catch {
      /* noop */
    }
  }

  // 기본 LFO 웨이브 설정(phase 1/3)
  setWavePhase(1 / 3);

  return { lfo, lfoDepth, dc, setWavePhase, setDepth01, setFreq01, dispose };
}