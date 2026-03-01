import type { AppState } from "../app/state";
import type { PlayerState } from "../app/types";
import type { SliderIndex, PercType } from "../audio";

function isSliderIndex(n: number): n is SliderIndex {
    return n === 0 || n === 1 || n === 2;
}
function isPercType(n: number): n is PercType {
    return n === 0 || n === 1 || n === 2 || n === 3;
}

export interface Effects {
    screens: {
        updatePlayerCard: (seat: number, p: PlayerState | null) => void;
        updateAllPlayerCards: (seats: (PlayerState | null)[]) => void;
        updateIceCream: (seat: number, p: PlayerState | null) => void;
        updateAllIceCreams: (seats: (PlayerState | null)[], loadingEl?: HTMLElement) => Promise<void>;
        flashSlider: (sliderEl: HTMLElement | null, direction: "up" | "down" | null) => void;
        flashPerc: (seat: number) => void;
    };
    audio: {
        onSlider: (seat: number, idx: number, val: number) => void;
        onPerc: (seat: number, val: number) => void;
        onDiceAvg: (avg: number) => void;
        playerRampIn: (seat: number) => void;
        playerRampOut: (seat: number) => void;
        isEngineReady: () => boolean;
        isAudioStarted: () => boolean;
    };
    scheduleDiceAvg: () => void;
    startAudioIfReady: () => void;
}

export function createSocketHandlers(state: AppState, fx: Effects) {
    return {
        onPlayers: async (arr: Array<PlayerState | null>, loadingEl?: HTMLElement) => {
            arr?.forEach((p, seat) => {
                if (!p) return;
                state.seats[seat] = p;
                state.panMap[seat] = p.pan;
                if (p.dice !== undefined) state.diceMap.set(seat, p.dice);
            });

            fx.screens.updateAllPlayerCards(state.seats);
            await fx.screens.updateAllIceCreams(state.seats, loadingEl);

            fx.startAudioIfReady();
        },

        onPlayerLeft: ({ seat }: { seat: number }) => {
            const wasActive = state.seats[seat] !== null;
            state.seats[seat] = null;
            state.diceMap.delete(seat);

            if (fx.audio.isEngineReady() && fx.audio.isAudioStarted() && wasActive) {
                fx.audio.playerRampOut(seat);
            }

            fx.startAudioIfReady();
            fx.screens.updatePlayerCard(seat, null);
            fx.screens.updateIceCream(seat, null);
        },

        onPlayerJoined: (p: PlayerState) => {
            state.seats[p.seat] = p;
            state.panMap[p.seat] = p.pan;

            if (fx.audio.isAudioStarted() && p.seat >= 4) fx.audio.playerRampIn(p.seat);

            fx.startAudioIfReady();
            fx.screens.updatePlayerCard(p.seat, p);
            fx.screens.updateIceCream(p.seat, p);
        },

        onUpdateSlider: ({ seat, idx, val }: { seat: number; idx: number; val: number }) => {
            const p = state.seats[seat];
            if (!p) return;

            const oldVal = p.slider[idx];
            const direction = val > oldVal ? "up" : val < oldVal ? "down" : null;

            p.slider[idx] = val;

            if (fx.audio.isEngineReady() && isSliderIndex(idx)) {
                fx.audio.onSlider(seat, idx, val);
            }

            fx.screens.updatePlayerCard(seat, p);
            fx.screens.updateIceCream(seat, p);
            const sliderEl = document.getElementById(`s-${seat}-${idx}`);
            fx.screens.flashSlider(sliderEl, direction);
        },

        onUpdatePerc: ({ seat, val }: { seat: number; val: number }) => {
            const p = state.seats[seat];
            if (!p) return;

            p.perc = val;

            if (fx.audio.isEngineReady() && isPercType(val)) {
                fx.audio.onPerc(seat, val);
            }

            fx.screens.updatePlayerCard(seat, p);
            fx.screens.updateIceCream(seat, p);
            fx.screens.flashPerc(seat);
        },

        onUpdateDice: ({ seat, value }: { seat: number; value: number }) => {
            const p = state.seats[seat];
            if (!p) return;

            p.dice = value;
            state.diceMap.set(seat, value);

            fx.screens.updatePlayerCard(seat, p);

            if (fx.audio.isAudioStarted()) {
                fx.scheduleDiceAvg();
            }
        },
    };
}