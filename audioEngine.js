// audioEngine.js

// ===== CONFIG =====
const H = 64; // PeriodicWave의 하모닉 수
// const VOWELS = { 'ㅐ': [520, 2100, 2600], 'ㅗ': [500, 900, 2400], 'ㅕ': [600, 1400, 2600] };
const VOWELS = {
    'ㅗ': [378.4227598, 2697.335103, 3561.798727],
    'ㅐ': [772.5316769, 2168.926062, 3023.776787],
    'ㅕ': [320.6933387, 1496.635645, 2946.250096]
};
const ring = ['ㅗ', 'ㅐ', 'ㅕ'];
const detuneHzBySeat = {};
let masterHzNormalized = 0.35; // 💡 Store normalized value
let panMap = new Array(50).fill(0); // 패닝 값

// Web Audio Context 및 주요 노드
let ctx = null;
let master = null;
let carrierSum = null;
let formants = [];
let formantSum = null;
let amGain = null;
let dc = null;
let lfo = null;
let lfoDepth = null;
let morphKnob = { getPhase: () => 0, set: () => { } }; // 더미
let lfoKnob = { getPhase: () => 0, set: () => { } }; // 더미
let formantBaseGains = [0.8, 0.8, 0.8]; // 💡 F1, F2, F3의 '기본 게인' 저장 변수 추가

// 💡 FIX 1: 'currentVowel' -> 'targetVowel'로 이름 변경
let targetVowel = 'ㅗ';
// 💡 FIX 2: 모음 램프 상태 변수 추가
let vowelRamp = { from: 'ㅗ', to: 'ㅗ', startTime: 0, duration: 0 };

let lastDiceAvg = null;
let fDetune = [0, 0, 0];
let masterHz = 110;
const periodicWaveCache = new Map();
const carriers = new Array(50).fill(null);
const defA = { frequency: { value: 0 }, detune: { value: 0 } }; // 더미
const defB = { frequency: { value: 0 }, detune: { value: 0 } }; // 더미

// ===== UTILS =====
function now(dt = 0.01) { return ctx.currentTime + dt; }
function randRange(min, max) { return Math.random() * (max - min) + min; }
function envADSR(g, t, A = 0.002, D = 0.05, S = 0.0, R = 0.03, peak = 1.0) {
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(peak, t + A);
    g.linearRampToValueAtTime(S * peak, t + A + D);
    g.linearRampToValueAtTime(0, t + A + D + R);
}
function noiseBuffer(sec = 0.12) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * sec));
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
}
function burstBuffer(ms = 6) {
    const n = Math.max(8, Math.floor(ctx.sampleRate * ms / 1000));
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let a = 1.0, tau = n / 6;
    for (let i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * a; a *= Math.exp(-1 / tau); }
    return b;
}
function bandpass(f = 1000, Q = 8) {
    const bi = ctx.createBiquadFilter();
    bi.type = "bandpass";
    bi.frequency.value = f;
    bi.Q.value = Q;
    return bi;
}
function notch(f = 1000, Q = 8) {
    const bi = ctx.createBiquadFilter();
    bi.type = "notch";
    bi.frequency.value = f;
    bi.Q.value = Q;
    return bi;
}
function lowpass(f = 1000, Q = 8) {
    const bi = ctx.createBiquadFilter();
    bi.type = "lowpass";
    bi.frequency.value = f;
    bi.Q.value = Q;
    return bi;
}
const db = d => Math.pow(10, d / 20);
function centsFromHz(baseHz, dHz) { return 1200 * Math.log2((baseHz + dHz) / baseHz); }
function mapQ(v) { return 0.3 + v * 20; }
function mapGain(v, max = 1) {
    // v 값을 0~1 사이로 고정
    const v_clamped = Math.max(0, Math.min(1, v));

    // v^2 (제곱) 커브를 사용합니다. 
    // 이렇게 하면 슬라이더가 50% (0.5) 지점에 있을 때,
    // 실제 게인은 25% (0.5 * 0.5 = 0.25)가 됩니다.
    // 더 부드러운 시작을 원하면 v_clamped * v_clamped * v_clamped (v^3)도 좋습니다.
    const exponential_v = v_clamped * v_clamped;

    return exponential_v * max;
}
function mapDetuneHz(v, span) { return (v - 0.5) * 2 * span; }
function qCompensatedGain(Q) {
    const minQ = 0.3;
    const maxQ = 20.3;
    const maxG = 1.0;
    const minG = 0.5;
    const normalizedQ = (Q - minQ) / (maxQ - minQ);
    const compensation = maxG - normalizedQ * (maxG - minG);
    return Math.max(minG, Math.min(maxG, compensation));
}

// ---------- Periodic Wave ----------
function basisSpectrum(kind, n) {
    if (kind === "sin") return (n === 1) ? 1 : 0;
    if (kind === "saw") return 2 / (n * Math.PI);
    if (kind === "tri") { if (n % 2 === 1) { const amp = (8 / (Math.PI ** 2)) * (1 / (n ** 2)); const sign = ((n % 4 === 1) ? 1 : -1); return amp * sign; } return 0; }
}
function morphTwo(kindA, kindB, t) {
    const key = `${kindA}-${kindB}-${Math.round(t * 1000)}`;
    const hit = periodicWaveCache.get(key); if (hit) return hit;
    const real = new Float32Array(H + 1), imag = new Float32Array(H + 1);
    for (let n = 1; n <= H; n++) {
        const a = basisSpectrum(kindA, n);
        const b = basisSpectrum(kindB, n);
        imag[n] = (1 - t) * a + t * b;
    }
    const w = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    periodicWaveCache.set(key, w); return w;
}
function periodicWaveFromPhase(phase) {
    const p = ((phase % 1) + 1) % 1;
    if (p < 1 / 2) { const t = p * 2; return morphTwo("sin", "saw", t); }
    const t = (p - 1 / 2) * 2; return morphTwo("saw", "tri", t);
}

// ---------- Building Blocks (Percussion) ----------
function playFric({ center = 4000, Q = 1.5, dur = 0.12, amp = 1.2, pan = 0.0, dest = master } = {}) {
    const t = now(0.02);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    const bp = bandpass(center, Q);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(panner).connect(dest);
    envADSR(g.gain, t, 0.002, dur * 0.75, 0, 0.03, amp);
    src.start(t); src.stop(t + dur + 0.05);
}
function playBurst({ centers = [2000], dur = 0.05, amp = 1.5, burstMs = 6, pan = 0.0, dest = master, Q = 8 } = {}) {
    const t = now(0.01);
    const src = ctx.createBufferSource(); src.buffer = burstBuffer(burstMs);
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g);
    centers.forEach(f => {
        const bp = bandpass(f, Q);
        const gg = ctx.createGain(); gg.gain.value = 1;
        g.connect(bp); bp.connect(gg); gg.connect(panner); panner.connect(dest);
    });
    envADSR(g.gain, t, 0.001, dur * 0.8, 0, 0.02, amp);
    src.start(t); src.stop(t + dur + burstMs / 1000 + 0.05);
}
function playNasalPerc(center = 250, pan = 0.0, amp = 3.0) {
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    src.buffer = noiseBuffer(0.03);
    const bp = bandpass(center, 8);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(panner).connect(master);
    envADSR(g.gain, t, 0.002, 0.04, 0, 0.02, amp);
    src.start(t); src.stop(t + 0.1);
}
function playTapR({ centers = [1200, 2000], dur = 0.04, amp = 5.0, burstMs = 5, pan = 0.0, dest = master, Q = 8 } = {}) {
    const t = now(0.01);
    const src = ctx.createBufferSource(); src.buffer = burstBuffer(burstMs);
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    const g = ctx.createGain(); g.gain.value = db(12);
    src.connect(g);
    centers.forEach(f => {
        const bp = bandpass(f, Q);
        const gg = ctx.createGain(); gg.gain.value = 1;
        g.connect(bp); bp.connect(gg); gg.connect(panner); panner.connect(dest);
    });
    envADSR(g.gain, t, 0.001, dur * 0.8, 0, 0.02, amp);
    src.start(t); src.stop(t + dur + burstMs / 1000 + 0.05);
}
function playNg({ base = 200, lenMs = 70, nasalHz = 260, notchHz1 = 1500, notchHz2 = 3000, pan = 0.0, dest = master, amp = 0.5 } = {}) {
    const t0 = now(0.01);
    const len = Math.max(0.02, lenMs / 1000);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15; comp.knee.value = 15; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.08;
    const bp = bandpass(nasalHz, 3.0);
    const notchA = notch(notchHz1, 5.0);
    const notchB = notch(notchHz2, 4.0);
    const lp = lowpass(1200, 0.5);
    const panner = ctx.createStereoPanner(); panner.pan.value = pan;
    const env = ctx.createGain(); env.gain.value = 0;
    envADSR(env.gain, t0, 0.003, len * 0.9, 0.0, 0.03, amp * 11);
    const nSrc = ctx.createBufferSource(); nSrc.buffer = noiseBuffer(len);
    const nGain = ctx.createGain(); nGain.gain.value = 0;
    envADSR(nGain.gain, t0, 0.001, len * 0.85, 0.0, 0.02, amp);
    const osc = ctx.createOscillator(); osc.type = "sine";
    const baseJitter = base * (1 + randRange(-0.01, 0.01));
    osc.frequency.setValueAtTime(baseJitter, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, baseJitter * 0.92), t0 + len * 0.8);
    const oGain = ctx.createGain(); oGain.gain.value = 0;
    envADSR(oGain.gain, t0, 0.001, len * 0.95, 0.0, 0.02, amp);
    nSrc.connect(nGain).connect(bp);
    osc.connect(oGain).connect(bp);
    bp.connect(notchA).connect(notchB).connect(lp).connect(env).connect(panner).connect(comp).connect(dest);
    nSrc.start(t0); osc.start(t0);
    nSrc.stop(t0 + len); osc.stop(t0 + len);
}

// ---------- Initial Audio Graph Setup ----------
export function setupAudioEngine(morphKnobRef, lfoKnobRef, panMapRef) {
    if (ctx) {
        return { ctx, master, morphKnob, lfoKnob };
    }

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    morphKnob = morphKnobRef;
    lfoKnob = lfoKnobRef;
    panMap = panMapRef;

    carrierSum = ctx.createGain(); carrierSum.gain.value = 1;

    formants = [0, 1, 2].map(() => ({ bp: ctx.createBiquadFilter(), g: ctx.createGain() }));
    formants.forEach(f => { f.bp.type = "bandpass"; f.bp.Q.value = 5; f.g.gain.value = 0.8; });
    carrierSum.connect(formants[0].bp); formants[0].bp.connect(formants[0].g);
    carrierSum.connect(formants[1].bp); formants[1].bp.connect(formants[1].g);
    carrierSum.connect(formants[2].bp); formants[2].bp.connect(formants[2].g);
    formantSum = ctx.createGain(); formants.forEach(f => f.g.connect(formantSum));

    amGain = ctx.createGain(); amGain.gain.value = 1.0;
    dc = new ConstantSourceNode(ctx, { offset: 1 }); dc.start();
    lfo = ctx.createOscillator(); lfo.frequency.value = 2; lfo.start();
    lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(amGain.gain); dc.connect(amGain.gain);
    formantSum.connect(amGain).connect(master);

    const defAg = ctx.createGain(), defBg = ctx.createGain();
    defAg.gain.value = 0.18; defBg.gain.value = 0.18;
    defA.osc = ctx.createOscillator(); defB.osc = ctx.createOscillator();
    defA.osc.setPeriodicWave(periodicWaveFromPhase(1 / 3));
    defB.osc.setPeriodicWave(periodicWaveFromPhase(1 / 3));
    defA.osc.connect(defAg).connect(carrierSum);
    defB.osc.connect(defBg).connect(carrierSum);
    defA.osc.start(); defB.osc.start();

    for (let s = 4; s < 50; s++) createCarrier(s);

    setMasterHz(masterHzNormalized); // 💡 Use the stored normalized value
    setFormantFreqs(targetVowel);

    return { ctx, master, morphKnob, lfoKnob };
}

function createCarrier(seat) {
    if (carriers[seat]) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = panMap[seat] || 0;

    const base = (seat % 3 === 0) ? masterHz * (2 / 3) : masterHz;
    osc.frequency.value = base;
    const initialPhase = morphKnob.getPhase() || 0;
    osc.setPeriodicWave(periodicWaveFromPhase(initialPhase));
    g.gain.value = 0.0;
    osc.connect(g).connect(panner).connect(carrierSum);
    osc.start();
    carriers[seat] = { osc, g, panner, _phase: initialPhase };
}

// ---------- Public Control Functions ----------

export function getAudioContext() { return ctx; }
export function getMasterGainNode() { return master; }
export function getCarriers() { return carriers; }
export function getFormants() { return formants; }
export function getLFO() { return { lfo, lfoDepth }; }


export function getCurrentVowel() { return targetVowel; }

export function getVowelRampState() {
    return { ...vowelRamp, now: ctx?.currentTime ?? 0 };
}

export function getFDetune() { return fDetune; }
export function getMasterHz() { return masterHz; }
export function getMasterHzNormalized() { return masterHzNormalized; }
export function getDetuneHzBySeat() { return detuneHzBySeat; }


export function setMasterHz(v) {
    masterHzNormalized = Math.max(0, Math.min(1, v)); // 💡 Store and clamp the normalized value
    function expoMap01(v, minHz = 50, maxHz = 1000) { const r = maxHz / minHz; return minHz * Math.pow(r, v); }
    masterHz = expoMap01(masterHzNormalized); // 💡 Use the stored value
    for (let s = 4; s < 50; s++) {
        const c = carriers[s]; if (!c) continue;
        const base = (s % 3 === 0) ? masterHz * (2 / 3) : masterHz;
        c.osc.frequency.value = base;
        const dHz = detuneHzBySeat[s] || 0;
        c.osc.detune.value = centsFromHz(base, dHz);
    }
    defA.osc.frequency.value = masterHz; defB.osc.frequency.value = masterHz * 2 / 3;
    defA.osc.detune.value = centsFromHz(masterHz, -3);
    defB.osc.detune.value = centsFromHz(masterHz * 2 / 3, +3);
    return masterHz;
}

export function setMasterGain(v) {
    master.gain.value = v;
}

export function setFormantFreqs(v) {
    const [f1, f2, f3] = VOWELS[v];

    // 💡 FIX 5: 'setFormantFreqs' 호출 시 램프 상태 즉시 업데이트
    if (ctx) { // ctx가 초기화된 후에만
        vowelRamp = { from: v, to: v, startTime: ctx.currentTime, duration: 0 };
    } else {
        vowelRamp = { from: v, to: v, startTime: 0, duration: 0 };
    }

    formants[0].bp.frequency.value = f1 + fDetune[0];
    formants[1].bp.frequency.value = f2 + fDetune[1];
    formants[2].bp.frequency.value = f3 + fDetune[2];

    // 💡 FIX: 'currentVowel' -> 'targetVowel'
    targetVowel = v;
}

export function smoothTo(v, dur = 0.8) {
    const nowTime = ctx.currentTime;
    const [t1, t2, t3] = VOWELS[v];
    const currentF1 = formants[0].bp.frequency.value;
    const currentF2 = formants[1].bp.frequency.value;
    const currentF3 = formants[2].bp.frequency.value;

    // 💡 FIX 6: 'smoothTo' 호출 시 램프 상태('from' -> 'to') 설정
    const fromVowel = targetVowel;
    vowelRamp = { from: fromVowel, to: v, startTime: nowTime, duration: dur };

    formants.forEach(f => f.bp.frequency.cancelScheduledValues(nowTime));
    formants[0].bp.frequency.setValueAtTime(currentF1, nowTime);
    formants[1].bp.frequency.setValueAtTime(currentF2, nowTime);
    formants[2].bp.frequency.setValueAtTime(currentF3, nowTime);
    formants[0].bp.frequency.linearRampToValueAtTime(t1 + fDetune[0], nowTime + dur);
    formants[1].bp.frequency.linearRampToValueAtTime(t2 + fDetune[1], nowTime + dur);
    formants[2].bp.frequency.linearRampToValueAtTime(t3 + fDetune[2], nowTime + dur);

    // 💡 FIX: 'currentVowel' -> 'targetVowel'
    targetVowel = v;
}

export function neighborVowel(v, dir) {
    const i = ring.indexOf(v);
    return ring[(i + (dir > 0 ? 1 : -1) + ring.length) % ring.length];
}

export function onDiceAvg(avg) {
    const delta = (lastDiceAvg === null) ? 0 : avg - lastDiceAvg;
    const TH = 0.08;
    if (lastDiceAvg !== null && Math.abs(delta) > TH) {
        const dir = delta > 0 ? +1 : -1;
        // 💡 FIX: 'currentVowel' -> 'targetVowel'
        const next = neighborVowel(targetVowel, dir);
        const mag = Math.min(1, (Math.abs(delta) - TH) / 0.25);
        const dur = 0.2 + 2.3 * (1 - mag);

        // 💡💡💡 DEBUG LOGGING (요청 사항) 💡💡💡
        // console.log(`Vowel change: ${targetVowel} -> ${next}`);

        smoothTo(next, dur);
    }
    lastDiceAvg = avg;
    return { avg, delta };
}

export function onSlider(seat, idx, val) {
    if (!ctx) return;

    if (seat === 0) {//F1
         if (idx === 0) {
            const Q = mapQ(val);
            formants[0].bp.Q.value = Q;
            const currentGainVal = formants[0].g.gain.value;
            formants[0].g.gain.value = mapGain(formantBaseGains[0], 1) * qCompensatedGain(Q);
        }
        if (idx === 1) {
            formantBaseGains[0] = val;
            formants[0].g.gain.value = mapGain(val, 1) * qCompensatedGain(formants[0].bp.Q.value);
        }
        // 💡 FIX: 'currentVowel' -> 'targetVowel'
        if (idx === 2) { fDetune[0] = mapDetuneHz(val, 60); setFormantFreqs(targetVowel); }
    } else if (seat === 1) {
        if (idx === 0) { // Q 슬라이더
            const Q = mapQ(val);
            formants[1].bp.Q.value = Q;
            // 💡 [수정] 
            formants[1].g.gain.value = mapGain(formantBaseGains[1], 1) * qCompensatedGain(Q);
        }
        if (idx === 1) { // 게인 슬라이더
            formantBaseGains[1] = val; // 💡 [추가]
            formants[1].g.gain.value = mapGain(val, 1) * qCompensatedGain(formants[1].bp.Q.value);
        }
        if (idx === 2) { fDetune[1] = mapDetuneHz(val, 120); setFormantFreqs(targetVowel); }

    } else if (seat === 2) {
        if (idx === 0) { // Q 슬라이더
            const Q = mapQ(val);
            formants[2].bp.Q.value = Q;
            // 💡 [수정] 
            formants[2].g.gain.value = mapGain(formantBaseGains[2], 1) * qCompensatedGain(Q);
        }
        if (idx === 1) { // 게인 슬라이더
            formantBaseGains[2] = val; // 💡 [추가]
            formants[2].g.gain.value = mapGain(val, 1) * qCompensatedGain(formants[2].bp.Q.value);
        }

        if (idx === 2) { fDetune[2] = mapDetuneHz(val, 200); setFormantFreqs(targetVowel); }
    } else if (seat === 3) {
        if (idx === 0) {
            lfo.setPeriodicWave(periodicWaveFromPhase(val));
            lfoKnob.set(val);
        }
        if (idx === 1) {
            const maxDepth = 0.5; // 최대 변조 깊이를 50%로 제한 (0.0 ~ 1.0 자유롭게 조절)
            lfoDepth.gain.value = Math.max(0, Math.min(1, val)) * maxDepth;
        }
        if (idx === 2) { lfo.frequency.value = 0.1 + val * 10; }
    } else if (seat >= 4) {
        const c = carriers[seat]; if (!c) return;
        const baseHz = (seat % 3 === 0) ? masterHz * (2 / 3) : masterHz;

        if (idx === 0) {
            c.osc.setPeriodicWave(periodicWaveFromPhase(val));
            c._phase = val;
        }
        if (idx === 1) { c.g.gain.value = mapGain(val, 0.35); }
        if (idx === 2) {
            const dHz = mapDetuneHz(val, 12);
            detuneHzBySeat[seat] = dHz;
            c.osc.detune.value = centsFromHz(baseHz, dHz);
        }
    }
}

export function onPerc(seat, val) {
    if (!ctx) return;
    const s = (x) => x * (0.875 + 0.375 * panMap[seat]);
    const ampWeight = 0.8;
    switch (val) {
        case 0: // ㅇ (Nasal Perc)
            playNasalPerc(s(280), panMap[seat], 3.0 * ampWeight);
            playNasalPerc(s(1000), panMap[seat], 3.0 * ampWeight);
            break;
        case 1: // ㅊ (Fric + Burst)
            playBurst({ centers: [s(2500)], dur: 0.04, amp: 0.9 * ampWeight, pan: panMap[seat] });
            playFric({ center: s(4500), Q: 1.6, dur: 0.12, amp: 0.6 * ampWeight, pan: panMap[seat] });
            break;
        case 2: // ㄹ (Tap R)
            playTapR({ centers: [s(1200), s(2000)], amp: 15.0 * ampWeight, pan: panMap[seat] });
            break;
        case 3: // ㅡㅇ (Ng)
            playNg({ base: s(200), nasalHz: s(260), notchHz1: s(1500), notchHz2: s(3000), pan: panMap[seat], amp: 0.5 * ampWeight });
            break;
    }
}

export function playerRampIn(seat) {
    const c = carriers[seat];
    if (!c || !ctx) return;
    c.panner.pan.value = panMap[seat] || 0;
    const t = now(0.01);
    const duration = 0.5;
    const targetGain = 0.35; // 0.35는 0이 아니므로 exponentialRamp에 문제 없음

    c.g.gain.cancelScheduledValues(t);
    // 💡 현재 값에서 시작하도록 설정 (중요)
    c.g.gain.setValueAtTime(c.g.gain.value, t);
    // 💡 'exponentialRamp'로 변경
    c.g.gain.exponentialRampToValueAtTime(targetGain, t + duration);
}

export function playerRampOut(seat) {
    const c = carriers[seat];
    if (!c || !ctx) return;
    const t = now(0.01);
    const duration = 1.2;
    
    // 💡 0에 가까운 매우 작은 값 설정 (exponentialRamp는 0으로 갈 수 없음)
    const targetVolume = 0.0001; 

    c.g.gain.cancelScheduledValues(t);
    // 💡 현재 값에서 시작하도록 설정
    c.g.gain.setValueAtTime(c.g.gain.value, t);
    // 💡 'exponentialRamp'로 변경
    c.g.gain.exponentialRampToValueAtTime(targetVolume, t + duration);
    
    // 💡 페이드 아웃이 끝난 직후 확실하게 0.0으로 설정
    c.g.gain.linearRampToValueAtTime(0.0, t + duration + 0.1);
}