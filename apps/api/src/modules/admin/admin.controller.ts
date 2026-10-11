import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import * as S from "@aptransit/shared";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { QueueStatusService } from "../queue/queue-status.service";
import { AdminService } from "./admin.service";
const idPipe = new ZodValidationPipe(S.PublicId),
  queryPipe = new ZodValidationPipe(S.AdminQuery);
@Controller("admin")
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly queues: QueueStatusService,
  ) {}
  /** Last 50 failed background jobs, newest first (STATE_ADMIN and up: policy:write). */
  @Get("jobs/failed") @Can("policy:write") async failedJobs() {
    return z.array(S.FailedJobDto).parse(await this.queues.failed(50));
  }
  @Get("stops/:id") @Can("network:write") async getStop(@Param("id",idPipe) id:string) {return S.AdminStopDto.parse(await this.service.getStop(id));}
  @Get("routes/:id") @Can("network:write") async getRoute(@Param("id",idPipe) id:string) {return S.AdminRouteDto.parse(await this.service.getRoute(id));}
  @Get("timetables/:id") @Can("network:write") async getTimetable(@Param("id",idPipe) id:string) {return S.AdminTimetableDto.parse(await this.service.getTimetable(id));}
  @Get("stops") @Can("network:write") async listStop(@Query(queryPipe) q: S.AdminQuery) {
    return z.array(S.AdminStopDto).parse(await this.service.stops(q));
  }
  @Post("stops") @Can("network:write") async createStop(
    @Body(new ZodValidationPipe(S.AdminStopInput)) b: S.AdminStopInput,
    @Req() req: Request,
  ) {
    return S.AdminStopDto.parse(
      await this.service.saveStop(undefined, b, auditActorFromRequest(req)),
    );
  }
  @Patch("stops/:id") @Can("network:write") async patchStop(
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(S.AdminStopPatch)) b: S.AdminStopPatch,
    @Req() req: Request,
  ) {
    return S.AdminStopDto.parse(await this.service.saveStop(id, b, auditActorFromRequest(req)));
  }
  @Get("routes") @Can("network:write") async listRoute(@Query(queryPipe) q: S.AdminQuery) {
    return z.array(S.AdminRouteDto).parse(await this.service.routes(q));
  }
  @Post("routes") @Can("network:write") async createRoute(
    @Body(new ZodValidationPipe(S.AdminRouteInput)) b: S.AdminRouteInput,
    @Req() req: Request,
  ) {
    return S.AdminRouteDto.parse(
      await this.service.saveRoute(undefined, b, auditActorFromRequest(req)),
    );
  }
  @Patch("routes/:id") @Can("network:write") async patchRoute(
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(S.AdminRoutePatch)) b: S.AdminRoutePatch,
    @Req() req: Request,
  ) {
    return S.AdminRouteDto.parse(await this.service.saveRoute(id, b, auditActorFromRequest(req)));
  }
  @Get("timetables") @Can("network:write") async listTimetable(@Query(queryPipe) _q: S.AdminQuery) {
    return z.array(S.AdminTimetableDto).parse(await this.service.timetables());
  }
  @Post("timetables") @Can("network:write") async createTimetable(
    @Body(new ZodValidationPipe(S.AdminTimetableInput)) b: S.AdminTimetableInput,
    @Req() req: Request,
  ) {
    return S.AdminTimetableDto.parse(
      await this.service.saveTimetable(undefined, b, auditActorFromRequest(req)),
    );
  }
  @Patch("timetables/:id") @Can("network:write") async patchTimetable(
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(S.AdminTimetablePatch)) b: S.AdminTimetablePatch,
    @Req() req: Request,
  ) {
    return S.AdminTimetableDto.parse(
      await this.service.saveTimetable(id, b, auditActorFromRequest(req)),
    );
  }
  @Delete("timetables/:id") @Can("network:write") async deactivate(
    @Param("id", idPipe) id: string,
    @Req() req: Request,
  ) {
    return S.AdminTimetableDto.parse(
      await this.service.saveTimetable(id, { isActive: false }, auditActorFromRequest(req)),
    );
  }
  @Post("trips/generate") @Can("network:write") async generate(
    @Body(new ZodValidationPipe(S.GenerateTripsInput)) b: S.GenerateTripsInput,
    @Req() req: Request,
  ) {
    return S.GenerateTripsDto.parse(await this.service.generate(b, auditActorFromRequest(req)));
  }
  @Get("users") @Can("user:roles") async users(@Query(queryPipe) q: S.AdminQuery) {
    return z.array(S.AdminUserDto).parse(await this.service.users(q));
  }
  @Post("users/:id/roles") @Can("user:roles") async grant(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(S.GrantRoleInput)) b: S.GrantRoleInput,
    @Req() req: Request,
  ) {
    return S.AdminRoleDto.parse(await this.service.grant(user, id, b, auditActorFromRequest(req)));
  }
  @Delete("users/:id/roles/:roleId") @Can("user:roles") async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Param("roleId", idPipe) roleId: string,
    @Req() req: Request,
  ) {
    return S.AdminRoleDto.parse(
      await this.service.revoke(user, id, roleId, auditActorFromRequest(req)),
    );
  }
  @Get("fare-rules") @Can("policy:write") async fares() {
    return z.array(S.AdminFareDto).parse(await this.service.fares());
  }
  @Put("fare-rules") @Can("policy:write") async fare(
    @Body(new ZodValidationPipe(S.AdminFareInput)) b: S.AdminFareInput,
    @Req() req: Request,
  ) {
    return S.AdminFareDto.parse(await this.service.fare(b, auditActorFromRequest(req)));
  }
  /** D-036 pass catalog. Edits apply to new sales only; audited as pass_type.create and pass_type.update. */
  @Get("pass-types") @Can("policy:write") async passTypes() {
    return z.array(S.AdminPassTypeDto).parse(await this.service.passTypes());
  }
  @Post("pass-types") @Can("policy:write") async createPassType(
    @Body(new ZodValidationPipe(S.AdminPassTypeInput)) b: S.AdminPassTypeInput,
    @Req() req: Request,
  ) {
    return S.AdminPassTypeDto.parse(await this.service.createPassType(b, auditActorFromRequest(req)));
  }
  @Patch("pass-types/:id") @Can("policy:write") async patchPassType(
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(S.AdminPassTypePatch)) b: S.AdminPassTypePatch,
    @Req() req: Request,
  ) {
    return S.AdminPassTypeDto.parse(await this.service.updatePassType(id, b, auditActorFromRequest(req)));
  }
  @Get("refund-policies") @Can("policy:write") async refunds() {
    return z.array(S.AdminRefundDto).parse(await this.service.refunds());
  }
  @Put("refund-policies") @Can("policy:write") async refund(
    @Body(new ZodValidationPipe(S.AdminRefundInput)) b: S.AdminRefundInput,
    @Req() req: Request,
  ) {
    return S.AdminRefundDto.parse(await this.service.refund(b, auditActorFromRequest(req)));
  }
  @Get("settings") @Can("policy:write") async settings() {
    return z.array(S.AdminSettingDto).parse(await this.service.settings());
  }
  @Put("settings") @Can("policy:write") async settingsWrite(
    @Body(new ZodValidationPipe(S.AdminSettingsInput)) b: S.AdminSettingsInput,
    @Req() req: Request,
  ) {
    return z
      .array(S.AdminSettingDto)
      .parse(await this.service.updateSettings(b, auditActorFromRequest(req)));
  }
  @Get("audit-logs") @Can("audit:read") async audit(
    @CurrentUser() user: AuthenticatedUser,
    @Query(queryPipe) q: S.AdminQuery,
  ) {
    return S.AdminAuditPage.parse(await this.service.auditLogs(user, q));
  }
}
