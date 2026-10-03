import { afterEach, describe, expect, it } from "vitest";
import { bullmqDrainDelaySec, bullmqProcessorOptions } from "./worker-options";

describe("bullmqDrainDelaySec", () => {
  const previous = process.env.BULLMQ_DRAIN_DELAY_SEC;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.BULLMQ_DRAIN_DELAY_SEC;
    } else {
      process.env.BULLMQ_DRAIN_DELAY_SEC = previous;
    }
  });

  it("defaults to 60 seconds (docs/15 Upstash budget)", () => {
    delete process.env.BULLMQ_DRAIN_DELAY_SEC;
    expect(bullmqDrainDelaySec()).toBe(60);
    expect(bullmqProcessorOptions()).toEqual({ drainDelay: 60 });
  });

  it("reads BULLMQ_DRAIN_DELAY_SEC when it is at least 5", () => {
    process.env.BULLMQ_DRAIN_DELAY_SEC = "90";
    expect(bullmqDrainDelaySec()).toBe(90);
  });

  it("falls back to 60 when the value is below 5 or not a number", () => {
    process.env.BULLMQ_DRAIN_DELAY_SEC = "1";
    expect(bullmqDrainDelaySec()).toBe(60);
    process.env.BULLMQ_DRAIN_DELAY_SEC = "nope";
    expect(bullmqDrainDelaySec()).toBe(60);
  });
});
