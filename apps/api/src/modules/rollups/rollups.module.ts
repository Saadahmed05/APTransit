import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RollupsService } from "./rollups.service";

@Module({
  imports: [PrismaModule],
  providers: [RollupsService],
  exports: [RollupsService],
})
export class RollupsModule {}
