"use client";
import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const get = () =>
  typeof window !== "undefined" && localStorage.getItem("apt_scanner_muted") === "true";
let audio: AudioContext | null = null;
export function unlockScannerAudio() {
  if (!audio && typeof AudioContext !== "undefined") audio = new AudioContext();
  void audio?.resume().catch(() => undefined);
}
export function useScannerMuted() {
  return useSyncExternalStore(subscribe, get, () => false);
}
export function toggleScannerMuted() {
  localStorage.setItem("apt_scanner_muted", String(!get()));
  listeners.forEach((fn) => fn());
}
export function scannerFeedback(valid: boolean) {
  navigator.vibrate?.(valid ? [70] : [200, 100, 200]);
  if (get() || !audio || audio.state !== "running") return;
  const oscillator = audio.createOscillator(),
    gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = valid ? 880 : 220;
  gain.gain.setValueAtTime(0.08, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.2);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
