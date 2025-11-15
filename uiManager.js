// uiManager.js

/**
 * 💡 1. Knob 위젯 생성기 (main.js에서 이동)
 */
export function makeKnob(el, onChange) {
    if (!el) return { set: () => { }, getPhase: () => 0 };

    let startY = null, startPhase = 0;
    let phase = 0;

    el.textContent = phase.toFixed(2);

    function setPhase(p) {
        phase = Math.max(0, Math.min(1, p));
        el.textContent = phase.toFixed(2);
        onChange(phase);
    }
    el.addEventListener('pointerdown', e => { startY = e.clientY; startPhase = phase; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
        if (startY === null) return;
        const dy = (startY - e.clientY);
        const delta = dy / 300;
        setPhase(startPhase + delta);
    });
    el.addEventListener('pointerup', () => { startY = null; });
    return { set: setPhase, getPhase: () => phase };
}

/**
 * 💡 2. URL, Panic 오버레이 DOM 생성 (main.js의 DOMContentLoaded에서 분리)
 * @param {HTMLElement} parent - 오버레이를 추가할 부모 요소 (e.g., document.body)
 * @returns {object} 생성된 DOM 요소 객체
 */
export function createOverlays(parent) {
    // URL 오버레이
    const urlOverlay = document.createElement('a');
    urlOverlay.id = 'url-overlay';
    parent.appendChild(urlOverlay);
    
    // Panic 오버레이
    const panicOverlay = document.createElement('div');
    panicOverlay.id = 'panic-overlay';
    panicOverlay.style.position = 'fixed';
    panicOverlay.style.top = '0';
    panicOverlay.style.left = '0';
    panicOverlay.style.width = '100vw';
    panicOverlay.style.height = '100vh';
    panicOverlay.style.backgroundColor = '#000';
    panicOverlay.style.opacity = '0';
    panicOverlay.style.pointerEvents = 'none'; 
    panicOverlay.style.zIndex = '999';
    panicOverlay.style.transition = 'opacity 5s linear';
    parent.appendChild(panicOverlay);

    return { urlOverlay, panicOverlay };
}

/**
 * 💡 3. 패닉 페이드 로직 (main.js의 'p' 키 리스너에서 분리)
 */
export function fadePanic(overlay, getMasterGainNode, getAudioContext) {
    console.log("Panic button pressed - fading out...");

    // 1. Fade audio
    const masterGain = getMasterGainNode();
    const audioCtx = getAudioContext();

    if (masterGain && audioCtx) {
        const now = audioCtx.currentTime;
        const fadeDuration = 5.0; 
        const fadeEndTime = now + fadeDuration;
        const targetVolume = 0.0001; 

        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.exponentialRampToValueAtTime(targetVolume, fadeEndTime);
        masterGain.gain.linearRampToValueAtTime(0.0, fadeEndTime + 0.1);
    }

    // 2. Fade visuals
    if (overlay) {
        overlay.style.opacity = '1.0';
    }
}

/**
 * 💡 4. URL 오버레이 표시 로직 (main.js의 startControl 리스너에서 분리)
 */
export function showURLOverlay(urlOverlayEl, originalJoinLink) {
     if (urlOverlayEl && originalJoinLink) {
        if (originalJoinLink.href) {
            urlOverlayEl.href = originalJoinLink.href;
            urlOverlayEl.target = "_blank";
        } else {
            urlOverlayEl.removeAttribute('href');
            urlOverlayEl.style.cursor = 'default';
        }
        urlOverlayEl.textContent = originalJoinLink.textContent;
        urlOverlayEl.style.display = 'block';
    }
}