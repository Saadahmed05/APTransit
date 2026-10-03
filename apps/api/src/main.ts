import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { Env } from "./config/env";
import { API_PREFIX, configureHttpApp } from "./http-app";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // POST /payments/webhook checks the Razorpay signature over the exact raw body
    rawBody: true,
  });
  configureHttpApp(app);

  const port = app.get<ConfigService<Env, true>>(ConfigService).get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`API listening on http://localhost:${port}/${API_PREFIX}`, "Bootstrap");
}

void bootstrap();
