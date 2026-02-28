// audio/engine/createEngine.ts
import type { AudioEngine, EngineInitOptions, EngineNodes, Vowel, SeatIndex, SliderIndex, PercType } from "./types";
import { DEFAULT_PARAMS, clamp01, mapQ, qCompensatedGain, mapGain, mapDetuneHz } from "./params";
import { createGraph } from "./graph";

import { createWaves } from "../modules/waves";
import { createFormants } from "../modules/formants";
import { createLFO } from "../modules/lfo";
import { createPerc } from "../modules/perc";
import { createCarriers } from "../modules/carriers";

export function createAudioEngine(): AudioEngine {
  const state: {
    inited: boolean;
    nodes: EngineNodes | null;
    panMap: number[];
    lastDiceAvg: number | null;
  } = {
    inited: false,
    nodes: null,
    panMap: new Array(DEFAULT_PARAMS.carriers.seats).fill(0),
    lastDiceAvg: null,
  };

  // modules
  let waves: ReturnType<typeof createWaves> | null = null;
  let formants: ReturnType<typeof createFormants> | null = null;
  let lfo: ReturnType<typeof createLFO> | null = null;
  let perc: ReturnType<typeof createPerc> | null = null;
  let carriers: ReturnType<typeof createCarriers> | null = null;

  function requireInit(): EngineNodes {
    if (!state.nodes || !waves || !formants || !lfo || !perc || !carriers) {
      throw new Error("AudioEngine not initialized. Call init() first.");
    }
    return state.nodes;
  }

  const api: AudioEngine = {
    init(opts: EngineInitOptions = {}) {
      if (state.inited) return api;

      const ctx = opts.ctx ?? new (window.AudioContext || window.webkitAudioContext)();
      const destination = opts.destination ?? ctx.destination;
      state.panMap = (opts.panMap && opts.panMap.length >= DEFAULT_PARAMS.carriers.seats)
        ? opts.panMap.slice(0, DEFAULT_PARAMS.carriers.seats)
        : state.panMap;

      const graph = createGraph(ctx, destination, { masterGain: DEFAULT_PARAMS.master.gain });

      // engine nodes
      state.nodes = { ctx, destination, mixBus: graph.mixBus, fxBus: graph.fxBus, master: graph.master };

      // modules assemble
      waves = createWaves(ctx, DEFAULT_PARAMS.H);

      // mixBus는 "캐리어 합"과 "퍼커션"이 들어오는 메인 입력
      // formants는 mixBus를 입력으로 받아 AM stage(amGain)까지 포함
      formants = createFormants(ctx, graph.mixBus);

      // formants.amGain을 fxBus로 연결 (FX/마스터로 이어짐)
      formants.amGain.connect(graph.fxBus);

      // carriers는 mixBus로 직접 출력 (그 뒤 formants가 mixBus를 받아 formantSum->amGain으로 처리)
      carriers = createCarriers(ctx, graph.mixBus, waves, state.panMap);

      // perc는 mixBus에 one-shot 출력
      perc = createPerc(ctx, graph.mixBus);

      // LFO는 formants.amGain.gain을 모듈레이션
      lfo = createLFO(ctx, formants.amGain.gain, waves);

      // 초기 master Hz 적용
      carriers.setMasterHz01(DEFAULT_PARAMS.master.defaultHz01);

      state.inited = true;
      return api;
    },

    dispose(opts?: { closeContext?: boolean }) {
      if (!state.inited) return;
      const nodes = state.nodes;

      carriers?.dispose();
      perc?.dispose();
      lfo?.dispose();
      formants?.dispose();
      waves?.dispose();

      // disconnect buses
      if (nodes) {
        try {
          nodes.mixBus.disconnect();
          nodes.fxBus.disconnect();
          nodes.master.disconnect();
        } catch {}
        if (opts?.closeContext) {
          try {
            nodes.ctx.close();
          } catch {}
        }
      }

      waves = null;
      formants = null;
      lfo = null;
      perc = null;
      carriers = null;
      state.nodes = null;
      state.inited = false;
    },

    setMasterGain(v: number) {
      const nodes = requireInit();
      nodes.master.gain.value = v;
    },

    setMasterHz01(v01: number) {
      requireInit();
      return carriers!.setMasterHz01(v01);
    },

    getMasterHz() {
      requireInit();
      return carriers!.getMasterHz();
    },

    getMasterHz01() {
      requireInit();
      return carriers!.getMasterHz01();
    },

    setPanMap(panMap: number[]) {
      requireInit();
      state.panMap = panMap.slice(0, DEFAULT_PARAMS.carriers.seats);
      carriers!.setPanMap(state.panMap);
    },

    getCurrentVowel() {
      requireInit();
      return formants!.getCurrentVowel();
    },

    getVowelRampState() {
      const nodes = requireInit();
      return formants!.getVowelRampState(nodes.ctx.currentTime);
    },

    setVowel(v: Vowel) {
      requireInit();
      formants!.setVowel(v);
    },

    smoothToVowel(v: Vowel, durSec = 0.8) {
      requireInit();
      formants!.smoothToVowel(v, durSec);
    },

    onDiceAvg(avg: number) {
      requireInit();
      const last = state.lastDiceAvg;
      const delta = last === null ? 0 : avg - last;
      const TH = 0.08;

      if (last !== null && Math.abs(delta) > TH) {
        const dir = delta > 0 ? +1 : -1;
        const ring = DEFAULT_PARAMS.formants.ring;
        const cur = formants!.getCurrentVowel();
        const i = ring.indexOf(cur);
        const next = ring[(i + (dir > 0 ? 1 : -1) + ring.length) % ring.length];

        const mag = Math.min(1, (Math.abs(delta) - TH) / 0.25);
        const dur = 0.2 + 2.3 * (1 - mag);
        formants!.smoothToVowel(next, dur);
      }

      state.lastDiceAvg = avg;
      return { avg, delta };
    },

    onSlider(seat: SeatIndex, idx: SliderIndex, val01: number) {
      requireInit();
      const s = Math.max(0, Math.min(DEFAULT_PARAMS.carriers.seats - 1, seat));
      const v = clamp01(val01);

      // seat 0..2: formants F1/F2/F3 (idx: Q, Gain, Detune)
      if (s === 0 || s === 1 || s === 2) {
        const fi = s as 0 | 1 | 2;
        if (idx === 0) {
          const Q = mapQ(v);
          formants!.setFormantQ(fi, Q);
          // 게인 보정은 엔진 라우팅에서 계산하여 formants.g.gain에 직접 적용하는 방식으로 확장 가능
          // 여기서는 "baseGain01"은 formants 내부에 저장, Q 보정은 여기서 곱해줌
          const compensated = qCompensatedGain(Q);
          // formants 내부 baseGain01을 업데이트하지 않고도 즉시 적용 가능하게, baseGain01을 업데이트
          formants!.setFormantBaseGain01(fi, formants!.formants[fi].g.gain.value); // noop 성격; 필요시 제거
          formants!.formants[fi].g.gain.value = mapGain(1, 1) * compensated; // 기본 유지용(원하시면 baseGain01 getter/setter 추가)
        }
        if (idx === 1) {
          // baseGain01 저장 + Q 보정 적용
          formants!.setFormantBaseGain01(fi, v);
          const Q = formants!.formants[fi].bp.Q.value;
          formants!.formants[fi].g.gain.value = mapGain(v, 1) * qCompensatedGain(Q);
        }
        if (idx === 2) {
          const span = fi === 0 ? 60 : fi === 1 ? 120 : 200;
          const dHz = mapDetuneHz(v, span);
          formants!.setFormantDetuneHz(fi, dHz);
        }
        return;
      }

      // seat 3: LFO (idx: wave, depth, freq)
      if (s === 3) {
        if (idx === 0) lfo!.setWavePhase(v);
        if (idx === 1) lfo!.setDepth01(v);
        if (idx === 2) lfo!.setFreq01(v);
        return;
      }

      // seat >=4: carriers (idx: wave, gain, detune)
      if (s >= DEFAULT_PARAMS.carriers.startSeat) {
        if (idx === 0) carriers!.setCarrierWavePhase(s, v);
        if (idx === 1) carriers!.setCarrierGain01(s, v);
        if (idx === 2) carriers!.setCarrierDetune01(s, v, 12);
      }
    },

    onPerc(seat: SeatIndex, val: PercType) {
      requireInit();
      const s = Math.max(0, Math.min(DEFAULT_PARAMS.carriers.seats - 1, seat));
      const pan = state.panMap[s] ?? 0;

      const scale = (x: number) => x * (0.875 + 0.375 * pan);
      const ampWeight = DEFAULT_PARAMS.perc.ampWeight;

      switch (val) {
        case 0:
          perc!.playNasalPerc(scale(280), pan, 3.0 * ampWeight);
          perc!.playNasalPerc(scale(1000), pan, 3.0 * ampWeight);
          break;
        case 1:
          perc!.playBurst({ centers: [scale(2500)], dur: 0.04, amp: 0.9 * ampWeight, pan });
          perc!.playFric({ center: scale(4500), Q: 1.6, dur: 0.12, amp: 0.6 * ampWeight, pan });
          break;
        case 2:
          perc!.playTapR({ centers: [scale(1200), scale(2000)], amp: 15.0 * ampWeight, pan });
          break;
        case 3:
          perc!.playNg({
            base: scale(200),
            nasalHz: scale(260),
            notchHz1: scale(1500),
            notchHz2: scale(3000),
            pan,
            amp: 0.5 * ampWeight,
          });
          break;
      }
    },

    playerRampIn(seat: SeatIndex) {
      requireInit();
      carriers!.playerRampIn(seat);
    },

    playerRampOut(seat: SeatIndex) {
      requireInit();
      carriers!.playerRampOut(seat);
    },

    getNodes() {
      return requireInit();
    },
  };

  return api;
}