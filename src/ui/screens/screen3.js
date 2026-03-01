// screen3.js
// Reads audio params via an injected provider to avoid cross-module imports.

let getEngine = () => null;

let canvas;
let ctx; // 2D Context
let container;

// 캔버스 중앙 및 최대 반경
let centerX, centerY;
let maxPixelRadius;

// 2. Time
let lastTimestamp = 0;
let totalTime = 0;

// 3. SVG Patterns
function parsePattern(pathString) {
    const points = [];
    const commands = pathString.trim().split(/\s*L\s*|\s*m\s*/);
    for (const cmd of commands) {
        if (cmd.trim() === '') continue;
        const [x, y] = cmd.trim().split(/\s+/).map(Number);
        if (!isNaN(x) && !isNaN(y)) {
            points.push([x, y]);
        }
    }
    return points;
}
const VOWEL_PATTERNS = {
    'ㅗ': parsePattern('m -4 0 L -0.5 0 L 0 5 L 0.5 0 L 4 0'),
    'ㅐ': parsePattern('m -4 0 L -2 0 L -2 -5 L -1 5 L -1 0 L 1 0 L 1 5 L 2 -5 L 2 0 L 4 0'),
    'ㅕ': parsePattern('m -3 0 L -2 0 L -2 -2 L 0 -2 L -2 2 L 0 2 L 1 -3 L 1 4 L 2 0 L 3 0')
};

// 4. Config
const MAX_JIGGLE_AMP = 50.0; // 스파이크의 최대 증폭값

// 💡💡💡 FIX 1: F1/F2 최소 크기 보장 및 F3 드라마틱 효과 💡💡💡

// 1. Define the *INPUT* frequency range
const MIN_FREQ = 200.0; // 💡 300Hz (이하)일 때
const MAX_FREQ = 2800.0;
const freqRange = MAX_FREQ - MIN_FREQ; // 2500

// 2. Define the *OUTPUT* radius range
const MIN_RADIUS_FRAC = 0.125; // 💡 최소 반지름은 20% (1/5)
const MAX_RADIUS_FRAC = 1.75;
const radiusRange = MAX_RADIUS_FRAC - MIN_RADIUS_FRAC; // 0.8

// 3. Power curve (2.0 = 제곱, 3.0 = 세제곱)
const FREQ_POWER_LAW = 2.5; // 💡 3.0 대신 2.0을 사용해 F1/F2의 변화를 좀 더 잘 보이게 함

function mapFreqToRadius(freq) {
    // 1. 💡 Normalize freq to the *input range* [0, 1]
    // (freq - 300) / 2500
    const t = Math.max(0, (freq - MIN_FREQ) / freqRange);

    // 2. 💡 Apply power curve to this normalized value
    // (e.g., F1(500Hz, t=0.08) -> 0.0064)
    // (e.g., F3(2600Hz, t=0.92) -> 0.8464)
    const easedT = Math.pow(t, FREQ_POWER_LAW);

    // 3. 💡 Map this final easedT (0-1) to the *output range* [0.2, 1.0]
    // minRadius + (easedT * radiusRange)
    const finalRadiusFraction = MIN_RADIUS_FRAC + (easedT * radiusRange);

    return finalRadiusFraction * maxPixelRadius;
}


/**
 * 💡 6. drawPatternCircle (느린 진동 반영됨)
 */
function drawPatternCircle(
    ctx, cx, cy, baseRadius,
    patternA, patternB, progress,
    jiggleScale,
    totalRepeats,
    formantGain, formantQ, time
) {
    // --- 1. Get pattern offsets (y-values only) ---
    const offsetsA = patternA.map(p => p[1]);
    const offsetsB = patternB.map(p => p[1]);
    const numOffsetsA = offsetsA.length;
    const numOffsetsB = offsetsB.length;

    if (numOffsetsA === 0 || numOffsetsB === 0) return;

    const totalPoints = 360;
    ctx.beginPath();

    for (let i = 0; i <= totalPoints; i++) {
        const angle = (i / totalPoints) * 2 * Math.PI;

        // --- 2. Calculate interpolated Vowel Shape (based on angle) ---
        // (This logic remains the same)
        // Pattern A
        const tA = (i / totalPoints) * numOffsetsA * totalRepeats;
        const i1A = Math.floor(tA) % numOffsetsA;
        const i2A = (i1A + 1) % numOffsetsA;
        const fracA = tA - Math.floor(tA);
        const offsetA = offsetsA[i1A] + (offsetsA[i2A] - offsetsA[i1A]) * fracA;
        // Pattern B
        const tB = (i / totalPoints) * numOffsetsB * totalRepeats;
        const i1B = Math.floor(tB) % numOffsetsB;
        const i2B = (i1B + 1) % numOffsetsB;
        const fracB = tB - Math.floor(tB);
        const offsetB = offsetsB[i1B] + (offsetsB[i2B] - offsetsB[i1B]) * fracB;
        // Final vowel shape
        const vowelOffset = offsetA + (offsetB - offsetA) * progress;

        // --- 3. Apply dynamic scales (Gain, Jiggle) ---
        const gainT = Math.sqrt(formantGain);
        const baseOffset = (vowelOffset * gainT) * jiggleScale;

        // --- 4. High-frequency "jiggle" (audiovisual) ---
        const dynamicFreq = 5.0 + formantQ * 1.0;
        const dynamicAmp = jiggleScale * (0.1 + (formantQ / 20.0));

        const spatialTerm = (i / totalPoints) * 360 * dynamicFreq * 0.1;

        // (유지) 느린 진동 속도
        const temporalTerm = time * dynamicFreq * 1.5;
        const dynamicOffset = Math.sin(spatialTerm + temporalTerm) * dynamicAmp;

        // --- 5. Final Position ---
        const totalOffset = baseOffset + dynamicOffset;
        const r = baseRadius + totalOffset;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}


// 💡 7. draw (main loop)
function draw(timestamp) {
    // ---- 엔진 준비 전이면 그냥 다음 프레임만 예약하고 끝 ----
    const engine = getEngine?.();
    if (!engine || !engine.getFormants || !engine.getVowelRampState) {
        requestAnimationFrame(draw);
        return;
    }

    // --- Timekeeping ---
    if (lastTimestamp === 0) lastTimestamp = timestamp;
    const deltaTime = (timestamp - lastTimestamp) / 1000.0; // in seconds
    totalTime += deltaTime;
    lastTimestamp = timestamp;

    requestAnimationFrame(draw);

    // --- 1. Get Audio Parameters ---
    // formant bank (3개 bandpass)
    const formants = engine.getFormants?.();
    const rampState = engine.getVowelRampState?.();

    if (!formants || formants.length < 3 || !rampState) return;

    let progress = (rampState.duration > 0)
        ? Math.min(1.0, (rampState.now - rampState.startTime) / rampState.duration)
        : 1.0;

    // 💡💡💡 FIX 1: F1, F2, F3가 모두 *통일된* mapFreqToRadius 함수 사용 💡💡💡
    const f1_r = mapFreqToRadius(formants[0].bp.frequency.value);
    const f2_r = mapFreqToRadius(formants[1].bp.frequency.value);
    const f3_r = mapFreqToRadius(formants[2].bp.frequency.value);

    const f1 = { f: formants[0].bp.frequency.value, g: formants[0].g.gain.value, q: formants[0].bp.Q.value, r: f1_r, c: 'rgba(255, 100, 100, 0.8)' };
    const f2 = { f: formants[1].bp.frequency.value, g: formants[1].g.gain.value, q: formants[1].bp.Q.value, r: f2_r, c: 'rgba(0, 255, 150, 0.8)' };
    const f3 = { f: formants[2].bp.frequency.value, g: formants[2].g.gain.value, q: formants[2].bp.Q.value, r: f3_r, c: 'rgba(0, 150, 255, 0.8)' };

    const allFormants = [f1, f2, f3];
    const patternA = VOWEL_PATTERNS[rampState.from] || VOWEL_PATTERNS['ㅗ'];
    const patternB = VOWEL_PATTERNS[rampState.to] || VOWEL_PATTERNS['ㅗ'];

    // --- 2. Clear Canvas ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- 3. Draw 3 Circles ---
    let i = 0;
    for (const f of allFormants) {

        // --- Dynamic Scale Calculations ---
        const normalizedGain = (Math.log10(f.g * 9 + 1));

        // 💡 반지름이 1.0 (maxPixelRadius)을 넘을 수 있으므로 clamp 제거
        const radiusFactor = (f.r / maxPixelRadius);

        const qFactor = (f.q / 5.0);

        // (유지) F2(초록원) 지글거림 스케일 감소
        let jiggleModifier = 1.0;
        if (i === 1) { // 0=F1, 1=F2, 2=F3
            jiggleModifier = 0.5; // F2(초록)만 50%
        }

        const dynamicJiggleScale = normalizedGain * qFactor * radiusFactor * MAX_JIGGLE_AMP * jiggleModifier;

        // (유지) X축 확장
        const dynamicRepeats = 10 + (1.0 - Math.min(1.0, radiusFactor)) * 60;

        // --- Draw Call ---
        ctx.strokeStyle = f.c;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        drawPatternCircle(
            ctx, centerX, centerY, f.r,
            patternA, patternB, progress,
            dynamicJiggleScale,
            dynamicRepeats,
            f.g, f.q, totalTime
        );

        i++; // 포먼트 인덱스 증가
    }
}

// 8. handleResize
function handleResize() {
    if (!container || !canvas) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) {
        return;
    }

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;
    // 💡 maxPixelRadius는 이제 '기준' 크기 (1.0)
    maxPixelRadius = Math.min(centerX, centerY) * 0.9;

    if (ctx) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// 9. init
export function init(containerElement, canvasId, deps) {
    // deps: { getEngine: () => AudioEngine | null }
    if (deps && typeof deps.getEngine === 'function') {
        getEngine = deps.getEngine;
    }

    container = containerElement;
    canvas = document.getElementById(canvasId);
    if (!canvas) throw new Error(`Canvas with id #${canvasId} not found.`);

    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Failed to get 2D context.");

    window.addEventListener('resize', handleResize);
    handleResize(); // 초기 크기 설정

    // 그리기 루프 시작
    draw(0);
}