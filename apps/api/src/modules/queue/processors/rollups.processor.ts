import { formatIstDate } from "@aptransit/shared";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { RollupsService } from "../../rollups/rollups.service";
import { QUEUES } from "../queue.constants";
import { bullmqProcessorOptions } from "../worker-options";

export const DAILY_ROLLUPS_JOB = "daily-rollups";

@Processor(QUEUES.ROLLUPS, bullmqProcessorOptions())
export class RollupsProcessor extends WorkerHost {
  private readonly logger = new Logger(RollupsProcessor.name);

  constructor(private readonly rollupsService: RollupsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === DAILY_ROLLUPS_JOB) {
      // Computes daily_stats for yesterday in IST
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = formatIstDate(yesterday);

      this.logger.log(`Running daily rollups job for yesterday (${yesterdayStr})`);
      await this.rollupsService.computeRollupsForDate(yesterdayStr);
    }
  }
}
