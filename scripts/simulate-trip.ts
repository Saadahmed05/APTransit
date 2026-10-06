/* eslint-disable no-console */
/**
 * GPS simulator (docs/13). Drives a seeded trip through the same API a real driver uses:
 * OTP login (dev echo code), start the trip, POST /tracking/ping along the route, end the trip.
 *
 *   pnpm simulate --trip <tripId> [--speed 10]
 *   pnpm simulate --all [--depot KNL] [--speed 10]
 *
 * Options: --api <url> (API_URL or http://localhost:4000), --email (driver.knl@aptransit.test),
 * --key (SIM_DEVICE_KEY or the seeded sim_driver_key_kurnool_01).
 * Login needs OTP_DEV_ECHO=1 on the API (local, CI, or a staging demo session).
 * --delay-at <stopSeq>:<minutes> pauses at a stop for real server minutes.
 * --breakdown-at <km> reports a breakdown and leaves the trip running.
 */

type Stop = {
  stopId: string;
  seq: number;
  nameEn: string;
  lat: number;
  lng: number;
  kmFromOrigin: number;
  minutesFromOrigin: number;
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback?: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1]!.startsWith("--")
    ? args[index + 1]!
    : fallback;
};

const API = (option("api", process.env.API_URL ?? "http://localhost:4000") ?? "").replace(
  /\/$/,
  "",
);
const EMAIL = option("email", "driver.knl@aptransit.test")!;
const DEVICE_KEY = option("key", process.env.SIM_DEVICE_KEY ?? "sim_driver_key_kurnool_01")!;
const SPEED = Math.max(1, Number(option("speed", "10")));
const delayArg = option("delay-at");
const delayParts = delayArg?.split(":").map(Number);
const breakdownArg = option("breakdown-at");
const breakdownKm = breakdownArg === undefined ? null : Number(breakdownArg);
if (
  !Number.isFinite(SPEED) ||
  (delayParts &&
    (delayParts.length !== 2 ||
      !Number.isInteger(delayParts[0]) ||
      !Number.isFinite(delayParts[1]) ||
      delayParts[1]! <= 0)) ||
  (breakdownKm !== null && (!Number.isFinite(breakdownKm) || breakdownKm < 0))
)
  throw new Error("Invalid simulator speed, delay or breakdown options");
/** A point every 5 s of simulated time. */
const SIM_STEP_SEC = 5;
/**
 * docs/12 allows 30 pings per device per minute, and --all drives every trip with one driver and
 * one device. Requests share a budget of 25 a minute across trips; each carries up to 20 points.
 */
const REQUESTS_PER_MINUTE = 25;
let requestEveryMs = Math.max(2_000, (SIM_STEP_SEC * 1000) / SPEED);

let token = "";

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  retried = false,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}/api/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  // Access tokens live 15 min: log in again once
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    await login();
    return call<T>(path, init, true);
  }
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function login(): Promise<void> {
  token = "";
  const req = await call<{ devCode?: string; error?: { code: string } }>("/auth/otp/request", {
    method: "POST",
    body: { channel: "EMAIL", target: EMAIL },
  });
  if (!req.body.devCode)
    throw new Error(
      `No dev code for ${EMAIL} (${req.body.error?.code ?? req.status}). The API needs OTP_DEV_ECHO=1.`,
    );
  const verify = await call<{ accessToken?: string }>("/auth/otp/verify", {
    method: "POST",
    body: { channel: "EMAIL", target: EMAIL, code: req.body.devCode },
  });
  if (!verify.body.accessToken) throw new Error(`Login failed for ${EMAIL}`);
  token = verify.body.accessToken;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function bearing(a: Stop, b: Stop): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

/** Position at `minute` of the schedule, straight between stops (the seeded polylines are too). */
function positionAt(stops: Stop[], minute: number) {
  const last = stops.at(-1)!;
  if (minute >= last.minutesFromOrigin)
    return { lat: last.lat, lng: last.lng, speedKmh: 0, headingDeg: 0, done: true };
  const i = Math.max(
    1,
    stops.findIndex((s) => s.minutesFromOrigin > minute),
  );
  const a = stops[i - 1]!;
  const b = stops[i]!;
  const span = Math.max(1, b.minutesFromOrigin - a.minutesFromOrigin);
  const t = (minute - a.minutesFromOrigin) / span;
  const speedKmh = Math.min(119, ((b.kmFromOrigin - a.kmFromOrigin) / span) * 60);
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    speedKmh: Math.round(speedKmh),
    headingDeg: bearing(a, b),
    done: false,
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTrip(tripId: string): Promise<void> {
  const detail = await call<{ route: { code: string; stops: Stop[] }; error?: { code: string } }>(
    `/trips/${tripId}`,
  );
  if (detail.status !== 200)
    throw new Error(`Trip ${tripId}: ${detail.body.error?.code ?? detail.status}`);
  const stops = [...detail.body.route.stops].sort((a, b) => a.seq - b.seq);
  const label = `${detail.body.route.code} ${tripId}`;

  const start = await call<{ status?: string; error?: { code: string } }>(
    `/driver/trips/${tripId}/start`,
    { method: "POST" },
  );
  if (start.status !== 200 && start.body.error?.code !== "TRIP_NOT_STARTABLE")
    throw new Error(`${label}: start failed (${start.body.error?.code})`);
  console.log(
    `${label}: ${start.status === 200 ? "started" : "already running or not startable, continuing"} at speed x${SPEED}`,
  );

  const stallStop = delayParts ? stops.find((s) => s.seq === delayParts[0]) : null;
  if (delayParts && !stallStop) throw new Error("Unknown delay stop sequence");
  let stallUntil = 0;
  let stalled = false;
  let simMinute = 0;
  let lastLogged = -1;
  for (;;) {
    let stepMinutes = ((requestEveryMs / 1000) * SPEED) / 60;
    if (!stalled && stallStop && simMinute + stepMinutes >= stallStop.minutesFromOrigin) {
      simMinute = stallStop.minutesFromOrigin;
      stalled = true;
      stallUntil = Date.now() + delayParts![1]! * 60_000;
      console.log(
        `${label}: stall at stop ${stallStop.seq} for ${delayParts![1]} real minutes (server clock)`,
      );
    }
    if (Date.now() < stallUntil) stepMinutes = 0;
    const count = Math.min(20, Math.max(1, Math.round((stepMinutes * 60) / SIM_STEP_SEC)));
    const sentAt = Date.now();
    // Points spread over this request's real interval, so their times stay within 2 min of the server
    const points = Array.from({ length: count }, (_, k) => {
      const minute = simMinute + ((k + 1) / count) * stepMinutes;
      const p = positionAt(stops, minute);
      return {
        lat: p.lat,
        lng: p.lng,
        speedKmh: stepMinutes === 0 ? 0 : p.speedKmh,
        headingDeg: p.headingDeg,
        accuracyM: 8,
        recordedAt: new Date(sentAt - (count - 1 - k) * (requestEveryMs / count)).toISOString(),
      };
    });
    simMinute += stepMinutes;
    const res = await call<{ error?: { code: string; details?: unknown } }>("/tracking/ping", {
      method: "POST",
      body: { tripId, points },
      headers: { "X-Device-Key": DEVICE_KEY },
    });
    if (res.status !== 202) {
      console.error(
        `${label}: ping refused ${res.status} ${res.body?.error?.code ?? ""} ${JSON.stringify(res.body?.error?.details ?? "")}`,
      );
      if (res.status !== 429) return;
    }
    const nextIndex = stops.findIndex((s) => s.minutesFromOrigin > simMinute);
    const left = nextIndex > 0 ? stops[nextIndex - 1]! : stops.at(-1)!;
    const right = nextIndex > 0 ? stops[nextIndex]! : left;
    const km =
      left.kmFromOrigin +
      (right.kmFromOrigin - left.kmFromOrigin) *
        Math.max(
          0,
          Math.min(
            1,
            (simMinute - left.minutesFromOrigin) /
              (right.minutesFromOrigin - left.minutesFromOrigin || 1),
          ),
        );
    if (breakdownKm !== null && km >= breakdownKm && res.status === 202) {
      const incident = await call<{ code?: string }>("/driver/incidents", {
        method: "POST",
        body: { type: "BREAKDOWN", note: "Simulator breakdown" },
      });
      if (incident.status !== 201) throw new Error(`Breakdown report failed: ${incident.status}`);
      console.log(`${label}: breakdown ${incident.body.code}, movement stopped`);
      return;
    }
    const minuteMark = Math.floor(simMinute / 15);
    if (minuteMark !== lastLogged) {
      lastLogged = minuteMark;
      console.log(
        `${label}: ${Math.round(simMinute)} of ${stops.at(-1)!.minutesFromOrigin} scheduled minutes`,
      );
    }
    if (positionAt(stops, simMinute).done) break;
    await wait(Math.max(0, requestEveryMs - (Date.now() - sentAt)));
  }

  const end = await call<{ status?: string; error?: { code: string } }>(
    `/driver/trips/${tripId}/end`,
    { method: "POST" },
  );
  console.log(
    `${label}: ${end.status === 200 ? "completed" : `end refused (${end.body.error?.code})`}`,
  );
}

async function main(): Promise<void> {
  await login();
  const tripId = option("trip");
  if (tripId) return runTrip(tripId);
  if (!flag("all")) throw new Error("Use --trip <tripId> or --all [--depot KNL]");

  const depot = option("depot");
  const trips =
    await call<
      { tripId: string; status: string; depotCode: string; scheduledDepartureAt: string }[]
    >("/driver/trips");
  const now = Date.now();
  const due = trips.body.filter(
    (t) =>
      (t.status === "RUNNING" ||
        Math.abs(Date.parse(t.scheduledDepartureAt) - now) <= 60 * 60_000) &&
      (!depot || t.depotCode === depot || t.depotCode === `D-${depot}`),
  );
  if (due.length === 0) {
    console.log("No trips are due now for this driver.");
    return;
  }
  requestEveryMs = Math.max(requestEveryMs, (60_000 * due.length) / REQUESTS_PER_MINUTE);
  console.log(
    `Simulating ${due.length} trips, one ping per trip every ${Math.round(requestEveryMs / 1000)} s`,
  );
  await Promise.all(
    due.map((t) =>
      runTrip(t.tripId).catch((err: unknown) => console.error((err as Error).message)),
    ),
  );
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
