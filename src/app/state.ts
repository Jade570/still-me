import type { PlayerState, Seats } from "./types";

export interface AppState {
  seats: Seats;                 // length 50
  panMap: number[];             // length 50
  diceMap: Map<number, number>; // seat -> dice
  audioStarted: boolean;
  audioEngineReady: boolean;
  diceUpdateTimer: number | null;
  spotlightActive: boolean;
  spotlightIndex: number;
}

export function createInitialState(): AppState {
  return {
    seats: new Array(50).fill(null),
    panMap: new Array(50).fill(0),
    diceMap: new Map(),
    audioStarted: false,
    audioEngineReady: false,
    diceUpdateTimer: null,
    spotlightActive: false,
    spotlightIndex: -1,
  };
}

export function activeCount(state: AppState): number {
  return state.seats.reduce((acc, p) => acc + (p ? 1 : 0), 0);
}