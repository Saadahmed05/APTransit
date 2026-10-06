"use client";
import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import { sessionStore } from "./session";
let socket: Socket | null = null;
let connected = false;
let disconnectedAt = 0;
const listeners = new Set<() => void>();
const rooms = new Map<string, number>();
const emit = () => {
  for (const fn of listeners) fn();
};
export function liveSocket(): Socket {
  if (socket) return socket;
  socket = io(
    (process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000").replace(/\/$/, "") + "/live",
    { auth: { token: sessionStore.get().accessToken }, autoConnect: false },
  );
  socket.on("connect", () => {
    connected = true;
    disconnectedAt = 0;
    for (const room of rooms.keys()) socket!.emit("subscribe", { room });
    emit();
  });
  socket.on("disconnect", () => {
    connected = false;
    disconnectedAt = Date.now();
    emit();
  });
  socket.on("connect_error", () => {
    if (!disconnectedAt) disconnectedAt = Date.now();
    emit();
  });
  sessionStore.subscribe(() => {
    if (!socket) return;
    socket.auth = { token: sessionStore.get().accessToken };
    socket.disconnect().connect();
  });
  window.addEventListener("offline", () => socket?.disconnect());
  window.addEventListener("online", () => socket?.connect());
  disconnectedAt = Date.now();
  socket.connect();
  return socket;
}
export function subscribeRoom(room: string): () => void {
  const s = liveSocket();
  const count = rooms.get(room) ?? 0;
  rooms.set(room, count + 1);
  if (!count && s.connected) s.emit("subscribe", { room });
  return () => {
    const next = (rooms.get(room) ?? 1) - 1;
    if (next > 0) rooms.set(room, next);
    else {
      rooms.delete(room);
      s.emit("unsubscribe", { room });
    }
  };
}
const subscribe = (fn: () => void) => {
  liveSocket();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function useSocketConnected(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => connected,
    () => false,
  );
}
export function shouldPollLive(now: number): boolean {
  return !connected && disconnectedAt > 0 && now - disconnectedAt >= 10_000;
}
