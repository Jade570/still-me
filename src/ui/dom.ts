// src/ui/dom.ts

export interface DomRefs {
  // 필수(없으면 앱 동작 불가)
  startContainer: HTMLElement;
  controlsContainer: HTMLElement;
  startButton: HTMLButtonElement;
  loadingMessage: HTMLElement;
  screen1Container: HTMLElement;
  screen2Container: HTMLElement;
  screen3Container: HTMLElement;
  waitingContainer: HTMLElement;
  participantCountEl: HTMLElement;
  joinLink: HTMLParagraphElement;
  startControlButton: HTMLButtonElement;

  // 선택(없어도 앱은 살아야 함)
  morphKnobEl: HTMLElement | null;
  lfoKnobEl: HTMLElement | null;
  actEl: HTMLElement | null;
  statusMessageEl: HTMLElement | null;
}

function mustGet(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

function mustGetAs<T extends HTMLElement>(
  id: string,
  guard: (el: HTMLElement) => el is T
): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  if (!guard(el)) throw new Error(`#${id} has unexpected element type`);
  return el;
}

function getOptional<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function getDomRefs(): DomRefs {
  return {
    startContainer: mustGet("start-container"),
    controlsContainer: mustGet("controls-container"),
    startButton: mustGetAs("start", (el): el is HTMLButtonElement => el instanceof HTMLButtonElement),
    loadingMessage: mustGet("loading-message"),
    screen1Container: mustGet("carriers"),
    screen2Container: mustGet("screen-2-container"),
    screen3Container: mustGet("screen-3-container"),
    waitingContainer: mustGet("waiting-container"),
    participantCountEl: mustGet("participant-count"),
    joinLink: mustGetAs("join-link", (el): el is HTMLParagraphElement => el instanceof HTMLParagraphElement),
    startControlButton: mustGetAs("startControl", (el): el is HTMLButtonElement => el instanceof HTMLButtonElement),

    // knobs는 초기 화면에 없을 수 있으니 optional
    morphKnobEl: getOptional("morphKnob"),
    lfoKnobEl: getOptional("lfoKnob"),

    // UI 표시용 optional
    actEl: getOptional("act"),
    statusMessageEl: getOptional("status-message"),
  };
}