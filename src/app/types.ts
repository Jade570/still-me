export type SeatIndex = number; // 0..49로 운용

export interface PlayerState {
  id?: string;
  seat: SeatIndex;
  pan: number;
  slider: [number, number, number];
  perc?: number;
  dice?: number;
}

export type Seats = Array<PlayerState | null>;

export interface EnvConfig {
  WS_URL: string;
  JOIN_LINK_TEXT: string;
  DICE_DEBOUNCE_MS: number;
  MIN_AUDIENCE_TO_START: number;
}