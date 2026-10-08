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
  /** Seconds since the last worker heartbeat; null when none is stored (Day 18). */
  workerAgeSec: z.number().int().nonnegative().nullable().optional(),
  /** Jobs per queue (Day 18); missing when Redis cannot be read. */
  queues: z
    .record(z.string(), z.object({ waiting: z.number().int(), active: z.number().int(), delayed: z.number().int(), failed: z.number().int() }))
    .optional(),
  version: z.string(),
  time: z.iso.datetime(),
});
export type HealthDto = z.infer<typeof HealthDto>;
