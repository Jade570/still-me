// src/app/initApp.ts
import { createInitialState } from "./state";
import { startAudioIfReady } from "./startAudioIfReady";
import { getDomRefs } from "../ui/dom";
import { createScreens } from "../ui/screens";
import { connectSocket } from "../net/socket";
import { createSocketHandlers } from "../net/handlers";
import { bindKeys } from "../input/keys";
import { bindWheel } from "../input/wheel";
import { ensureOverlays, showURLOverlay, fadePanic } from "../ui/overlays";
import { makeKnob } from "../ui/knobs";
import { createAudioEngine } from "../audio";
import * as screen3 from "../ui/screens/screen3"; // ✅ setEngine 주입용
import { hideCursor, showCursor } from "../ui/cursor";

export async function initApp() {
    const env = {
        WS_URL: import.meta.env.VITE_WS_URL,
        JOIN_LINK_TEXT: import.meta.env.VITE_JOIN_LINK,
        DICE_DEBOUNCE_MS: 200,
        MIN_AUDIENCE_TO_START: 5,
    };

    const state = createInitialState();
    const dom = getDomRefs();
    const overlays = ensureOverlays(document.body);

    // 초기 화면 세팅
    dom.controlsContainer.style.display = "none";
    dom.waitingContainer.style.display = "none";
    dom.startContainer.style.display = "block";
    dom.loadingMessage.style.display = "block";

    // join-link 텍스트
    dom.joinLink.textContent = env.JOIN_LINK_TEXT;

    // screens init (screen2 async 포함)
    const screens = await createScreens({
        screen1Container: dom.screen1Container,
        screen2Container: dom.screen2Container,
        screen3Container: dom.screen3Container,
        loadingMessage: dom.loadingMessage,
    });

    // ✅ 레거시 동작 복원: 로딩 끝나면 Start 버튼 활성화
    dom.loadingMessage.style.display = "none";
    dom.startButton.disabled = false;

    // knobs (DOM에 없으면 no-op knob)
    const morphKnob = makeKnob(dom.morphKnobEl, (phase) => {
        // 레거시: 전체 캐리어 phase 갱신은 엔진 준비 후에만 의미 있음
        // 여기서는 엔진이 있을 때만 동작하도록 engine 변수로 연결(아래)
        if (engine) {
            for (let s = 4; s < 50; s++) engine.onSlider(s, 0, phase);
            screens.updateAllPlayerCards(state.seats);
        }
    });

    const lfoKnob = makeKnob(dom.lfoKnobEl, (phase) => {
        if (engine) engine.onSlider(3, 0, phase);
    });

    // audio engine: user gesture 전에는 init하지 않음
    let engine: ReturnType<typeof createAudioEngine> | null = null;

    const audioFacade = {
        isReady: () => state.audioEngineReady,
        isStarted: () => state.audioStarted,

        startMasterFadeIn: () => {
            if (!engine) return;
            const ctx = engine.getNodes().ctx;
            const master = engine.getNodes().master;
            master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.0);
        },

        rampInAllActiveSeats: (seats: any[]) => {
            if (!engine) return;
            seats.forEach((p, seat) => {
                if (p && seat >= 4) engine!.playerRampIn(seat);
            });
        },
    };

    const scheduleDiceAvg = () => {
        if (state.diceUpdateTimer) window.clearTimeout(state.diceUpdateTimer);
        state.diceUpdateTimer = window.setTimeout(() => {
            if (!engine) return;
            const vals = [...state.diceMap.values()];
            const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
            engine.onDiceAvg(avg);
            state.diceUpdateTimer = null;
        }, env.DICE_DEBOUNCE_MS);
    };

    const startIfReady = () => startAudioIfReady({
        state,
        minAudience: env.MIN_AUDIENCE_TO_START,
        participantCountEl: dom.participantCountEl,
        statusMessageEl: dom.statusMessageEl,
        audio: audioFacade,
    });

    // socket handlers
    const handlers = createSocketHandlers(state, {
        screens: {
            updatePlayerCard: screens.updatePlayerCard,
            updateAllPlayerCards: screens.updateAllPlayerCards,
            updateIceCream: screens.updateIceCream,
            updateAllIceCreams: screens.updateAllIceCreams,
            flashSlider: screens.flashSlider,
            flashPerc: screens.flashPerc,
        },
        audio: {
            onSlider: (seat, idx, val) => engine?.onSlider(seat, idx as any, val),
            onPerc: (seat, val) => engine?.onPerc(seat, val as any),
            onDiceAvg: (avg) => engine?.onDiceAvg(avg),
            playerRampIn: (seat) => engine?.playerRampIn(seat),
            playerRampOut: (seat) => engine?.playerRampOut(seat),
            isEngineReady: () => state.audioEngineReady,
            isAudioStarted: () => state.audioStarted,
        },
        scheduleDiceAvg,
        startAudioIfReady: startIfReady,
    });

    // connect socket (Start 버튼 활성화는 players에서 하셔도 되고, 여기서 하셔도 됩니다)
    connectSocket({ wsUrl: env.WS_URL, handlers, loadingEl: dom.loadingMessage });

    // input bindings
    bindKeys({
        canHandle: () => dom.controlsContainer.style.display !== "none",
        showScreen: screens.show,
        resetCamera: screens.resetCamera,
        spotlightNext: () => { /* 레거시 spotlight 로직 옮기기: 필요하면 다음 단계에서 분리 */ },
        panic: () => fadePanic(overlays.panicOverlay, {
            getMasterGainNode: () => engine?.getNodes().master ?? null,
            getAudioContext: () => engine?.getNodes().ctx ?? null,
        }),
        isSpotlightActive: () => state.spotlightActive,
    });

    bindWheel({
        isEnabled: () => state.audioEngineReady && dom.controlsContainer.style.display !== "none" && !!engine,
        getCurrent: () => engine?.getMasterHz01() ?? 0.35,
        setNext: (v01) => { engine?.setMasterHz01(v01); },
    });

    // Start 버튼
    dom.startButton.addEventListener("click", async () => {
        showCursor();
        dom.startContainer.style.display = "none";
        dom.waitingContainer.style.display = "flex";

        // 엔진 생성/초기화 + resume
        engine = createAudioEngine();
        engine.init({ panMap: state.panMap });

        // ✅ screen3에 엔진 주입 (이게 없으면 getCurrentVowel null 에러)
        screen3.setEngine(engine);

        const ctx = engine.getNodes().ctx;
        if (ctx.state !== "running") await ctx.resume();

        state.audioEngineReady = true;

        // master mute로 시작
        engine.setMasterGain(0.0);

        // 초기 상태 flush (슬라이더)
        state.seats.forEach((p, seat) => {
            if (p && Array.isArray(p.slider)) {
                p.slider.forEach((v, idx) => {
                    // idx는 0..2이므로 OK
                    engine!.onSlider(seat, idx as any, v);
                });
            }
        });

        // 초기 dice 평균
        const vals = [...state.diceMap.values()];
        const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
        engine.onDiceAvg(avg);

        startIfReady();
    });

    // startControl 버튼: 컨트롤 화면으로 전환
    dom.startControlButton.addEventListener("click", () => {
        hideCursor();
        dom.waitingContainer.style.display = "none";
        dom.controlsContainer.style.display = "flex";
        screens.show(1);

        showURLOverlay(overlays.urlOverlay, env.JOIN_LINK_TEXT);

        // 상태 메시지 갱신
        startIfReady();
    });
}