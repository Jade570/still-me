import { io, Socket } from "socket.io-client";
import type { PlayerState } from "../app/types";

export interface SocketHandlers {
    onPlayers: (arr: Array<PlayerState | null>, loadingEl?: HTMLElement) => void | Promise<void>;
    onPlayerLeft: (payload: { seat: number; id?: string }) => void;
    onPlayerJoined: (p: PlayerState) => void;
    onUpdateSlider: (p: { seat: number; idx: number; val: number }) => void;
    onUpdatePerc: (p: { seat: number; val: number }) => void;
    onUpdateDice: (p: { seat: number; value: number }) => void;
}

export function connectSocket(opts: {
    wsUrl: string;
    handlers: SocketHandlers;
    loadingEl?: HTMLElement;
}): Socket {
    const socket = io(opts.wsUrl, { transports: ["websocket"], path: "/socket.io" });


    socket.on("players", async (arr) => {
        try {
            await opts.handlers.onPlayers(arr, opts.loadingEl);
        } catch (e) {
            console.error("onPlayers failed:", e);
        }
    });
    socket.on("playerLeft", async (payload) => {
        try {
            await opts.handlers.onPlayerLeft(payload);
        } catch (e) {
            console.error("onPlayerLeft failed:", e);
        }
    });
    socket.on("playerJoined", async (p) => {
        try {
            await opts.handlers.onPlayerJoined(p);
        } catch (e) {
            console.error("onPlayerJoined failed:", e);
        }
    });
    socket.on("updateSlider", async (p) => {
        try {
            await opts.handlers.onUpdateSlider(p);
        } catch (e) {
            console.error("onUpdateSlider failed:", e);
        }
    });
        socket.on("updatePerc", async (p) => {
        try {
            await opts.handlers.onUpdatePerc(p);
        } catch (e) {
            console.error("onUpdatePerc failed:", e);
        }
    });
        socket.on("updateDice", async (p) => {
        try {
            await opts.handlers.onUpdateDice(p);
        } catch (e) {
            console.error("onUpdateDice failed:", e);
        }
    });

        socket.on("connect_error", (err) => console.error("connect_error:", err?.message, err));
        socket.on("disconnect", (r) => console.warn("performer disconnected:", r));
        return socket;
    }