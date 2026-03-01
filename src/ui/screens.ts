// src/ui/screens.ts
import type { Seats } from "../app/types";
import * as screen1 from "./screens/screen1";
import * as screen2 from "./screens/screen2";
import * as screen3 from "./screens/screen3";

export interface ScreensApi {
  show: (n: 1 | 2 | 3) => void;
  renderAll: (seats: Seats) => void;

  updatePlayerCard: typeof screen1.updatePlayerCard;
  updateAllPlayerCards: typeof screen1.updateAllPlayerCards;

  updateIceCream: typeof screen2.updateIceCream;
  updateAllIceCreams: typeof screen2.updateAllIceCreams;

  flashSlider: typeof screen1.flashSlider;
  flashPerc: typeof screen1.flashPerc;

  spotlightSeat: typeof screen2.spotlightSeat;
  resetCamera: typeof screen2.resetCamera;
}

export async function createScreens(dom: {
  screen1Container: HTMLElement;
  screen2Container: HTMLElement;
  screen3Container: HTMLElement;
  loadingMessage?: HTMLElement;
}, deps?: {
  getEngine?: () => any;
}) : Promise<ScreensApi> {

  screen1.init(dom.screen1Container);

  // ✅ 원래 레거시 main.js처럼 여기서 init
  await screen2.init(dom.screen2Container);
  screen3.init(dom.screen3Container, "formant-canvas", {
    getEngine: deps?.getEngine,
  });

  const show = (n: 1|2|3) => {
    dom.screen1Container.style.display = n === 1 ? "grid" : "none";
    dom.screen2Container.style.display = n === 2 ? "block" : "none";
    dom.screen3Container.style.display = n === 3 ? "block" : "none";
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  };

  return {
    show,
    renderAll: (seats) => {
      screen1.updateAllPlayerCards(seats);
      // screen2는 필요할 때만 (players 이벤트에서 updateAllIceCreams 하므로)
    },

    updatePlayerCard: screen1.updatePlayerCard,
    updateAllPlayerCards: screen1.updateAllPlayerCards,
    updateIceCream: screen2.updateIceCream,
    updateAllIceCreams: screen2.updateAllIceCreams,
    flashSlider: screen1.flashSlider,
    flashPerc: screen1.flashPerc,
    spotlightSeat: screen2.spotlightSeat,
    resetCamera: screen2.resetCamera,
  };
}