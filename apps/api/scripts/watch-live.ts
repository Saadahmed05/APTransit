/* eslint-disable no-console */
/**
 * Tiny Socket.IO client for the terminal (Day 11 verify): prints bus:position and trip:status.
 *   pnpm watch:live trip:<tripId>       (public room)
 *   pnpm watch:live depot:<depotId> --token <accessToken>
 * Options: --ws <url> (NEXT_PUBLIC_WS_URL or http://localhost:4000).
 */
import { io } from "socket.io-client";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const room = args.find((a) => !a.startsWith("--") && !Object.values({ ws: option("ws"), token: option("token") }).includes(a));
if (!room) {
  console.error("Usage: pnpm watch:live trip:<tripId> [--token <accessToken>] [--ws <url>]");
  process.exit(1);
}

const url = option("ws") ?? process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";
const token = option("token");
const socket = io(`${url}/live`, { auth: token ? { token } : {}, transports: ["websocket"] });

socket.on("connect", async () => {
  const ack = (await socket.emitWithAck("subscribe", { room })) as { ok: boolean; error?: string };
  console.log(ack.ok ? `Watching ${room}` : `Refused: ${ack.error}`);
});
socket.on("connect_error", (err) => console.error(`Cannot connect to ${url}/live: ${err.message}`));
socket.on("bus:position", (p: { tripId: string; lat: number; lng: number; speedKmh: number | null; progressPct: number; nextStopId: string | null; etaNextStopSec: number | null }) => {
  const eta = p.etaNextStopSec === null ? "" : ` next stop in ${Math.round(p.etaNextStopSec / 60)} min`;
  console.log(`${new Date().toLocaleTimeString()} ${p.tripId} ${p.lat.toFixed(4)},${p.lng.toFixed(4)} ${p.speedKmh ?? "?"} km/h ${p.progressPct}%${eta}`);
});
socket.on("trip:status", (s: { tripId: string; status: string; delayMinutes: number }) => console.log(`trip ${s.tripId}: ${s.status} (delay ${s.delayMinutes} min)`));
socket.on("incident:new", (i: { code: string; type: string }) => console.log(`incident ${i.code}: ${i.type}`));
