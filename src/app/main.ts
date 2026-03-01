import { initApp } from "./initApp";

window.addEventListener("DOMContentLoaded", () => {
  initApp().catch(console.error);
});