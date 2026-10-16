import { formatIstDate } from "@aptransit/shared";
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { addDateDays } from "./trip-generator";
import { TripGeneratorService } from "./trip-generator.service";

const BOOT_DELAY_MS = 15_000;
const REFILL_EVERY_MS = 6 * 60 * 60_000;
const LOCK_KEY = "tripgen:lock";
const LOCK_SECONDS = 15 * 60;
const DATE_MEMO_MS = 10 * 60_000;

/**
 * D-048: trips must exist for the whole booking window even when no worker runs (the free API
 * host sleeps, and the BullMQ worker is optional). Three layers, all idempotent:
 * 1. on API boot and every 6 h, fill today to today plus `booking.daysAhead`;
 * 2. the worker's daily job calls the same `ensureWindow` (same Redis lock);
 * 3. a search for a date inside the window with no trips at all generates that day first.
 */
@Injectable()
export class TripWindowService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TripWindowService.name);
  private readonly checked = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];
  /** Off in unit and HTTP tests (memory Prisma) and inside the worker process, which has its own job. */
  readonly enabled: boolean;
  private readonly inWorker: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly generator: TripGeneratorService,
    config: ConfigService<Env, true>,
  ) {
    this.inWorker = Boolean(config.get("WORKER", { infer: true }));
    this.enabled = config.get("NODE_ENV", { infer: true }) !== "test";
  }

  onApplicationBootstrap(): void {
    if (!this.enabled || this.inWorker) return;
    const run = () => void this.ensureWindow().catch((error: unknown) => this.logger.warn(`Trip window fill failed: ${String(error)}`));
    const boot = setTimeout(run, BOOT_DELAY_MS);
    const every = setInterval(run, REFILL_EVERY_MS);
    boot.unref();
    every.unref();
    this.timers = [boot, every];
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  /** Fills the whole booking window, prunes switched off timetables, applies the demo crew. */
  async ensureWindow(now = new Date()): Promise<number> {
    if (!(await this.lock(LOCK_KEY))) return 0;
    try {
      const today = formatIstDate(now);
      const last = addDateDays(today, await this.generator.windowDays());
      let created = 0;
      for (let day = today; day <= last; day = addDateDays(day, 1)) {
        created += await this.generator.generateRange(day, day);
      }
      await this.generator.pruneInactiveFuture(today);
      await this.generator.applyAutoAssign(today, last);
      await this.redis.client.set("tripgen:through", last).catch(() => undefined);
      return created;
    } finally {
      await this.redis.client.del(LOCK_KEY).catch(() => undefined);
    }
  }

  /**
   * Before a search: when the date is inside the booking window and has no trips at all, generate
   * it now. Never throws, a failed fill only means the search shows what exists.
   */
  async ensureDate(date: string, now = new Date()): Promise<void> {
    if (!this.enabled) return;
    const at = this.checked.get(date);
    if (at !== undefined && now.getTime() - at < DATE_MEMO_MS) return;
    try {
      const today = formatIstDate(now);
      const last = addDateDays(today, await this.generator.windowDays());
      if (date < today || date > last) return;
      const count = await this.prisma.trip.count({ where: { serviceDate: new Date(`${date}T00:00:00.000Z`) } });
      if (count === 0 && (await this.lock(`tripgen:date:${date}`))) {
        try {
          await this.generator.generateRange(date, date);
          await this.generator.applyAutoAssign(date, date);
        } finally {
          await this.redis.client.del(`tripgen:date:${date}`).catch(() => undefined);
        }
      }
      this.checked.set(date, now.getTime());
    } catch (error) {
      this.logger.warn(`Trip fill for ${date} failed: ${String(error)}`);
    }
  }

  /** A Redis lock; when Redis is down the fill still runs (generation is idempotent). */
  private async lock(key: string): Promise<boolean> {
    try {
      return (await this.redis.client.set(key, "1", "EX", LOCK_SECONDS, "NX")) === "OK";
    } catch {
      return true;
    }
  }
}
