import type { AppState } from "./state";

export function startAudioIfReady(args: {
  state: AppState;
  minAudience: number;
  participantCountEl: HTMLElement;
  statusMessageEl: HTMLElement | null;
  audio: {
    isReady: () => boolean;
    isStarted: () => boolean;
    startMasterFadeIn: () => void;
    rampInAllActiveSeats: (seats: (any|null)[]) => void;
  };
}) {
  const { state, minAudience, participantCountEl, statusMessageEl, audio } = args;

  const active = state.seats.filter(Boolean).length;
  participantCountEl.textContent = String(active);

  const remaining = Math.max(0, minAudience - active);
  if (active >= minAudience && !audio.isStarted()) {
    if (audio.isReady()) {
      audio.startMasterFadeIn();
      state.audioStarted = true;
      audio.rampInAllActiveSeats(state.seats);

      if (statusMessageEl) {
        statusMessageEl.textContent = "Audio ON | Connected";
        statusMessageEl.style.backgroundColor = "#4CAF50";
      }
    }
  } else if (active < minAudience && statusMessageEl && !audio.isStarted()) {
    statusMessageEl.textContent = `Waiting for ${remaining} more Audience...`;
    statusMessageEl.style.backgroundColor = "#FFC107";
  }
}