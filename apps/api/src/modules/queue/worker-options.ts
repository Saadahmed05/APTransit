/**
 * BullMQ Worker `drainDelay` is in seconds (default 5). docs/15 sets 60 so an idle
 * worker stays inside the Upstash free command budget.
 */
export function bullmqDrainDelaySec(): number {
  const raw = process.env.BULLMQ_DRAIN_DELAY_SEC;
  const parsed = raw === undefined || raw === "" ? 60 : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 5) {
    return 60;
  }
  return parsed;
}

export function bullmqProcessorOptions(): { drainDelay: number } {
  return { drainDelay: bullmqDrainDelaySec() };
}
