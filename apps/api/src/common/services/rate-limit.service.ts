import { Injectable } from "@nestjs/common";
import type { Response } from "express";
import { RedisService } from "../../redis/redis.service";
import { AppError } from "../errors/app-error";
import { hitWindow } from "./redis-window";

/** Auth limits from docs/12 that are keyed by something other than user or IP (the OTP target). */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  private async enforce(
    key: string,
    limit: number,
    windowSec: number,
    message: string,
    res?: Response,
  ): Promise<void> {
    const hit = await hitWindow(this.redis.client, key, windowSec * 1000);
    // Redis unreachable: do not block users. OTP attempts are still capped in the database.
    if (!hit || hit.hits <= limit) return;

    const retryAfter = Math.max(1, Math.ceil(hit.ttlMs / 1000));
    res?.setHeader("Retry-After", String(retryAfter));
    throw new AppError("RATE_LIMITED", message, { retryAfter });
  }

  async assertOtpRequestLimit(target: string, ip: string, res?: Response): Promise<void> {
    await this.enforce(
      `ratelimit:otp:req:target:${target}`,
      3,
      600,
      "Too many codes requested. Wait a few minutes and try again.",
      res,
    );
    await this.enforce(
      `ratelimit:otp:req:ip:${ip}`,
      10,
      3600,
      "Too many codes requested from this network. Try again later.",
      res,
    );
  }

  async assertOtpVerifyLimit(target: string, res?: Response): Promise<void> {
    await this.enforce(
      `ratelimit:otp:verify:target:${target}`,
      5,
      600,
      "Too many verification attempts. Wait a few minutes and try again.",
      res,
    );
  }

  async assertRefreshLimit(userId: string, res?: Response): Promise<void> {
    await this.enforce(
      `ratelimit:auth:refresh:${userId}`,
      30,
      3600,
      "Too many refresh attempts. Try again later.",
      res,
    );
  }

  /** POST /feedback: 5 per IP per hour, logged in or not (Day 16, docs/12). */
  async assertFeedbackLimit(ip: string, res?: Response): Promise<void> {
    await this.enforce(`ratelimit:feedback:ip:${ip}`, 5, 3600, "Too much feedback from this network. Try again later.", res);
  }

  /** GET /feedback/status: 20 lookups per IP per 10 minutes, so codes cannot be guessed. */
  async assertFeedbackLookupLimit(ip: string, res?: Response): Promise<void> {
    await this.enforce(`ratelimit:feedback:status:ip:${ip}`, 20, 600, "Too many lookups. Wait a few minutes and try again.", res);
  }
}
