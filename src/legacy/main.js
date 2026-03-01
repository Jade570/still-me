import { io } from "socket.io-client";

import {
    setupAudioEngine, getAudioContext, getMasterGainNode,
    onSlider, onPerc, onDiceAvg,
    setMasterHz, setMasterGain, setFormantFreqs,
    getCarriers, getFormants, getLFO, getCurrentVowel, getFDetune, getMasterHz, getDetuneHzBySeat,
    playerRampIn, playerRampOut,
    getMasterHzNormalized
} from './audioEngine.js';


// 💡 1. 신규 모듈 import
import * as screen1 from './screen1.js';
import * as screen2 from './screen2.js';
import * as screen3 from './screen3.js';
import * as ui from './uiManager.js'; // 💡 UI 매니저 import

// ===== CONFIG & STATE =====

const WS_URL = import.meta.env.VITE_WS_URL;
const JOIN_LINK_TEXT = import.meta.env.VITE_JOIN_LINK;
const DICE_DEBOUNCE_MS = 200;
const MIN_AUDIENCE_TO_START = 5;
const seats = new Array(50).fill(null);
const diceMap = new Map();
const panMap = new Array(50).fill(0);

let audioStarted = false;
let audioEngineReady = false;
let diceUpdateTimer = null;


// ===== DOM Elements =====
let startContainer;
let controlsContainer;
let startButton;
let loadingMessage;
let screen1Container;
let screen2Container;
let screen3Container;
let urlOverlayEl;
let panicOverlayEl;
let waitingContainer;
let participantCountEl;
let morphKnobEl;
let lfoKnobEl;
let morphKnob;
let lfoKnob;

// 💡 State for screen 2 spotlight
let spotlightIndex = -1;
let spotlightActive = false;

// 💡 makeKnob 함수 uiManager.js로 이동


// 💡 PLAYER CARD RENDERING 함수들 screen1.js로 이동
// (updatePlayerCard, updateAllPlayerCards)


// ===== UI STATE MANAGEMENT (5명 카운트 로직) =====
function startAudioIfReady() {
    const activeCount = seats.filter(p => p !== null).length;
    const remaining = Math.max(0, MIN_AUDIENCE_TO_START - activeCount);

    if (participantCountEl) {
        participantCountEl.textContent = activeCount;
    }

    const actElement = document.getElementById('act');
    if (actElement) actElement.textContent = activeCount;
    const statusMessage = document.getElementById('status-message');

    if (activeCount >= MIN_AUDIENCE_TO_START && !audioStarted) {
        if (audioEngineReady) {
            const ctx = getAudioContext();
            if (ctx) {
                getMasterGainNode().gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.0);
                audioStarted = true;

                seats.forEach((p, seat) => {
                    if (p && seat >= 4) playerRampIn(seat);
                });
                
                if (statusMessage) {
                    statusMessage.textContent = "Audio ON | Connected";
                    statusMessage.style.backgroundColor = '#4CAF50';
                }
            }
        }
    }
    else if (activeCount < MIN_AUDIENCE_TO_START && statusMessage) {
        if (!audioStarted) {
            statusMessage.textContent = `Waiting for ${remaining} more Audience...`;
            statusMessage.style.backgroundColor = '#FFC107';
        }
    }
}

// ===== SOCKET & CORE LOGIC =====
function connectSocket(loadingMessageEl) {
    const socket = io(WS_URL, { transports: ["websocket"], path: "/socket.io"});
    socket.on("players", async (arr) => {
        if (loadingMessageEl) {
            loadingMessageEl.textContent = 'Generating 3D visuals... (0/50)';
        }

        arr?.forEach((p, seat) => {
            if (!p) return;
            seats[seat] = p;
            panMap[seat] = p.pan;
            if (p.dice !== undefined) diceMap.set(seat, p.dice);
        });

        // 💡 screen1 모듈 함수 호출
        screen1.updateAllPlayerCards(seats); 

        await screen2.updateAllIceCreams(seats, loadingMessageEl);

        if (loadingMessageEl) {
            loadingMessageEl.style.display = 'none'; 
        }
        if (startButton) {
            startButton.disabled = false; 
            startButton.textContent = 'Start audio';
        }

        startAudioIfReady();
    });

    socket.on("playerLeft", ({ seat, id }) => {
        const wasActive = seats[seat] !== null;
        seats[seat] = null;
        diceMap.delete(seat);

        if (audioEngineReady && audioStarted && wasActive) playerRampOut(seat);

        startAudioIfReady();
        screen1.updatePlayerCard(seat, null); // 💡 screen1 모듈 함수 호출
        screen2.updateIceCream(seat, null); 
    });

    socket.on("updateSlider", ({ seat, idx, val }) => {
        const p = seats[seat]; if (!p) return;

        let direction = null;
        const oldVal = p.slider[idx];
        if (val > oldVal) direction = 'up';
        else if (val < oldVal) direction = 'down';

        p.slider[idx] = val;
        if (audioEngineReady) onSlider(seat, idx, val);

        screen1.updatePlayerCard(seat, p); // 💡 screen1 모듈 함수 호출
        screen2.updateIceCream(seat, p); 

        // 💡 screen1 모듈로 DOM 조작 위임
        const sliderEl = document.getElementById(`s-${seat}-${idx}`);
        screen1.flashSlider(sliderEl, direction);
    });

    socket.on("updatePerc", ({ seat, val }) => {
        const p = seats[seat]; if (!p) return;
        p.perc = val;

        if (audioEngineReady) onPerc(seat, val);
        
        screen1.updatePlayerCard(seat, p); // 💡 screen1 모듈 함수 호출
        screen2.updateIceCream(seat, p); 

        // 💡 screen1 모듈로 DOM 조작 위임
        screen1.flashPerc(seat);
    });
    
    socket.on("updateDice", ({ seat, value }) => {
        const p = seats[seat]; if (!p) return;
        p.dice = value;
        diceMap.set(seat, value);

        // 💡 screen1 모듈 함수 호출
        screen1.updatePlayerCard(seat, p); 

        if (diceUpdateTimer) {
            clearTimeout(diceUpdateTimer);
        }

        if (audioStarted) {
            diceUpdateTimer = setTimeout(() => {
                const vals = [...diceMap.values()];
                const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
                onDiceAvg(avg);
                diceUpdateTimer = null; 
            }, DICE_DEBOUNCE_MS);
        }
    });

    socket.on("playerJoined", (p) => {
        seats[p.seat] = p;
        panMap[p.seat] = p.pan;

        if (audioStarted && p.seat >= 4) playerRampIn(p.seat);

        startAudioIfReady();
        screen1.updatePlayerCard(p.seat, p); // 💡 screen1 모듈 함수 호출
        screen2.updateIceCream(p.seat, p); 
    });

    socket.on("connect", () => console.log("performer connected", socket.id));
    socket.on("connect_error", (err) => console.error("connect_error:", err?.message, err));
    socket.on("disconnect", (r) => console.warn("performer disconnected:", r));
}


// ===== 화면 전환 리스너 =====
document.addEventListener('keydown', (e) => {
    if (!controlsContainer || controlsContainer.style.display === 'none') return;

    const triggerResize = () => {
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50); 
    };

    if ((e.key === '1' || e.key === '3') && spotlightActive) {
        screen2.resetCamera();
    }

    if (e.key === '1') {
        if (screen1Container) screen1Container.style.display = 'grid';
        if (screen2Container) screen2Container.style.display = 'none';
        if (screen3Container) screen3Container.style.display = 'none'; 
        console.log("Switched to Screen 1 (Cards)");

    } else if (e.key === '2') {
        if (screen1Container) screen1Container.style.display = 'none';
        if (screen2Container) screen2Container.style.display = 'block'; 
        if (screen3Container) screen3Container.style.display = 'none'; 

        if (spotlightActive) {
            screen2.resetCamera();
        }

        triggerResize(); 
        console.log("Switched to Screen 2 (3D View)");

    } else if (e.key === '3') { 
        if (screen1Container) screen1Container.style.display = 'none';
        if (screen2Container) screen2Container.style.display = 'none';
        if (screen3Container) screen3Container.style.display = 'block';
        triggerResize();
        console.log("Switched to Screen 3 (Formants)");
    }
    else if (e.key === 'a') {
        const activeSeats = [];
        seats.forEach((player, index) => {
            if (player !== null) {
                activeSeats.push(index);
            }
        });

        if (activeSeats.length === 0) {
            if (screen2Container && screen2Container.style.display !== 'none') {
                screen2.resetCamera();
            }
            spotlightActive = false;
            spotlightIndex = -1;
            return;
        }

        if (!spotlightActive) {
            spotlightIndex = 0;
            spotlightActive = true;
        } else {
            spotlightIndex = (spotlightIndex + 1) % activeSeats.length;
        }

        const seatToSpotlight = activeSeats[spotlightIndex];
        const playerState = seats[seatToSpotlight];
        if (!playerState) {
            spotlightActive = false;
            spotlightIndex = -1;
            return;
        }

        if (!screen2Container || screen2Container.style.display === 'none') {
            if (screen1Container) screen1Container.style.display = 'none';
            if (screen2Container) screen2Container.style.display = 'block'; 
            if (screen3Container) screen3Container.style.display = 'none';
            console.log("Switched to Screen 2 (3D View) via 'a' key");
        }

        console.log(`Spotlighting seat: ${seatToSpotlight}`);
        screen2.spotlightSeat(seatToSpotlight, playerState);

    } else if (e.key === 'p') {
        // 💡 uiManager 모듈로 로직 위임
        ui.fadePanic(panicOverlayEl, getMasterGainNode, getAudioContext);
    }
});


// 💡 ADD: Mouse wheel listener for master frequency
document.addEventListener('wheel', (e) => {
    if (!audioEngineReady || !controlsContainer || controlsContainer.style.display === 'none') return;

    e.preventDefault(); 

    const currentNormalized = getMasterHzNormalized();
    const delta = e.deltaY > 0 ? -0.01 : 0.01; 
    const newNormalized = Math.max(0, Math.min(1, currentNormalized + delta));

    if (currentNormalized !== newNormalized) {
        setMasterHz(newNormalized);
    }

}, { passive: false }); 


// ===== DOM CONTENT LOADED =====
document.addEventListener('DOMContentLoaded', async () => {

    // 💡 1. DOM 요소 찾기
    startContainer = document.getElementById('start-container');
    controlsContainer = document.getElementById('controls-container');
    startButton = document.getElementById('start');
    loadingMessage = document.getElementById('loading-message');
    screen1Container = document.getElementById('carriers');
    screen2Container = document.getElementById('screen-2-container');
    screen3Container = document.getElementById('screen-3-container');
    waitingContainer = document.getElementById('waiting-container');
    participantCountEl = document.getElementById('participant-count');
    const originalJoinLink = document.getElementById('join-link');
    const startControlButton = document.getElementById('startControl');


    originalJoinLink.textContext = JOIN_LINK_TEXT;

    // 💡 2. uiManager로 오버레이 생성 위임
    const overlays = ui.createOverlays(document.body);
    urlOverlayEl = overlays.urlOverlay;
    panicOverlayEl = overlays.panicOverlay;

    // 💡 3. Knob DOM 찾기 및 uiManager로 Knob 객체 생성
    morphKnobEl = document.getElementById('morphKnob');
    lfoKnobEl = document.getElementById('lfoKnob');

    morphKnob = ui.makeKnob(morphKnobEl, phase => {
        for (let s = 4; s < 50; s++) onSlider(s, 0, phase);
        if (screen1Container && screen1Container.style.display !== 'none') {
            // 💡 screen1 모듈 함수 호출
            screen1.updateAllPlayerCards(seats); 
        }
    });

    lfoKnob = ui.makeKnob(lfoKnobEl, phase => {
        onSlider(3, 0, phase);
        if (screen1Container && screen1Container.style.display !== 'none') {
            // 💡 screen1 모듈 함수 호출
            screen1.updatePlayerCard(3, seats[3]);
        }
    });


    // 💡 4. screen1 모듈로 DOM 생성 위임
    if (screen1Container) {
        screen1.init(screen1Container);
        screen1.updateAllPlayerCards(seats); // 초기 빈 상태 렌더링
    } else {
        console.error("#carriers container not found.");
    }

    // 💡 5. screen2 (3D) 초기화
    try {
        if (screen2Container) {
            await screen2.init(screen2Container);
            console.log("3D scene initialized.");
        } else {
            throw new Error("#screen-2-container not found.");
        }
    } catch (err) {
        console.error("Failed to initialize 3D scene:", err);
        if (loadingMessage) {
            loadingMessage.textContent = "Error loading 3D assets. Please refresh.";
            loadingMessage.style.color = "red";
        }
        return; 
    }

    // 💡 6. screen3 (2D) 초기화
    try {
        if (screen3Container) {
            screen3.init(screen3Container, 'formant-canvas');
            console.log("2D scene initialized.");
        } else {
            throw new Error("#screen-3-container not found.");
        }
    } catch (err) {
        console.error("Failed to initialize 2D scene:", err);
    }

    // 💡 7. 소켓 연결
    if (loadingMessage) {
        loadingMessage.textContent = 'Connecting to server...';
    }
    connectSocket(loadingMessage);

    // 💡 8. "Start" 버튼 핸들러 (오디오 시작)
    if (startButton) {
        startButton.addEventListener('click', async (e) => {
            if (!startContainer || !controlsContainer) {
                console.error("Start/Controls container not found.");
                return;
            }

            startContainer.style.display = 'none';
            waitingContainer.style.display = 'flex';

            const { ctx } = setupAudioEngine(morphKnob, lfoKnob, panMap);
            if (ctx.state !== "running") await ctx.resume();

            audioEngineReady = true; 

            if (getMasterGainNode()) {
                getMasterGainNode().gain.value = 0.0;
            }

            // ... (Master Gain 슬라이더 설정 코드 - 현재는 없으므로 생략) ...

            console.log("Flushing initial state to audio engine (silently)...");
            seats.forEach((p, seat) => {
                if (p && Array.isArray(p.slider)) {
                    p.slider.forEach((v, idx) => onSlider(seat, idx, v));
                }
            });

            const vals = [...diceMap.values()];
            const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
            if (audioEngineReady) onDiceAvg(avg);

            startAudioIfReady();
        });
    } else {
        console.error("#start button not found.");
    }
    
    // 💡 9. 'startControl' 버튼 핸들러 (대기 화면 -> 컨트롤 화면)
    if (startControlButton) {
        startControlButton.addEventListener('click', () => {
            console.log("startControl button clicked. Transitioning to controls.");

            if (waitingContainer) waitingContainer.style.display = 'none';
            if (controlsContainer) controlsContainer.style.display = 'flex';
            if (screen1Container) screen1Container.style.display = 'grid'; 

            // 💡 uiManager로 URL 오버레이 표시 위임
            const originalJoinLink = document.getElementById('join-link');
            ui.showURLOverlay(urlOverlayEl, originalJoinLink);
            
            const statusMessage = document.getElementById('status-message');
            if (statusMessage) {
                if (audioStarted) {
                    statusMessage.textContent = "Audio ON | Connected";
                    statusMessage.style.backgroundColor = '#4CAF50';
                } else {
                    const activeCount = seats.filter(p => p !== null).length;
                    const remaining = Math.max(0, MIN_AUDIENCE_TO_START - activeCount);
                    statusMessage.textContent = `Waiting for ${remaining} more Audience...`;
                    statusMessage.style.backgroundColor = '#FFC107';
                }
            }
        });
    } else {
        console.error("#startControl button not found.");
    }
});