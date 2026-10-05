import { z } from "zod";

/** GET /api/v1/health (docs/06, Health and auth). */
export const ProbeState = z.enum(["ok", "down"]);
export type ProbeState = z.infer<typeof ProbeState>;

export const HealthDto = z.object({
  status: z.enum(["ok", "degraded"]),
  db: ProbeState,
  redis: ProbeState,
  /** The background worker's heartbeat (Day 9). Does not change `status`: the API serves without it. */
  worker: z.enum(["ok", "stale"]),
  version: z.string(),
  time: z.iso.datetime(),
});
export type HealthDto = z.infer<typeof HealthDto>;
