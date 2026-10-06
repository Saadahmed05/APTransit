import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import {
  OpsDepotDto, OpsBusTypeDto,
  OpsQuery,
  OpsBusInput,
  OpsBusPatch,
  MaintenanceInput,
  AssignTripInput,
  ReplaceBusInput,
  OpsReasonInput,
  ResolveIncidentInput,
  OpsStaffInput,
  OpsDashboardDto,
  BusDto,
  BusProfileDto,
  MaintenanceDto,
  OpsTripDto,
  OpsTripProfileDto,
  TripDto,
  StaffDto,
  DeviceDto,
  IncidentDto,
  PublicId,
} from "@aptransit/shared";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { OpsService } from "./ops.service";
const idPipe = new ZodValidationPipe(PublicId),
  queryPipe = new ZodValidationPipe(OpsQuery);
@Controller("ops")
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class OpsController {
  constructor(private readonly ops: OpsService) {}
  @Get("depots") @Can("ops:read") async depots(@CurrentUser() u: AuthenticatedUser) { return z.array(OpsDepotDto).parse(await this.ops.depots(u)); }
  @Get("bus-types") @Can("ops:read") async busTypes() { return z.array(OpsBusTypeDto).parse(await this.ops.busTypes()); }
  @Get("routes") @Can("ops:read") async routes(@CurrentUser() u: AuthenticatedUser,@Query(queryPipe) q: OpsQuery) { return z.array(OpsDepotDto.pick({ id:true,nameEn:true,nameTe:true })).parse(await this.ops.routes(u,q)); }
  @Get("dashboard")
  @Can("ops:read")
  async dashboard(@CurrentUser() u: AuthenticatedUser, @Query(queryPipe) q: OpsQuery) {
    return OpsDashboardDto.parse(await this.ops.dashboard(u, q));
  }
  @Get("buses/available")
  @Can("ops:read")
  async available(@CurrentUser() u: AuthenticatedUser, @Query(queryPipe) q: OpsQuery) {
    return z.array(BusDto).parse(await this.ops.available(u, q));
  }
  @Get("buses")
  @Can("ops:read")
  async buses(@CurrentUser() u: AuthenticatedUser, @Query(queryPipe) q: OpsQuery) {
    return z.array(BusDto).parse(await this.ops.buses(u, q));
  }
  @Post("buses")
  @Can("fleet:write")
  async createBus(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(OpsBusInput)) b: OpsBusInput,
    @Req() r: Request,
  ) {
    return BusDto.parse(await this.ops.createBus(u, b, auditActorFromRequest(r)));
  }
  @Get("buses/:id")
  @Can("ops:read")
  async bus(@CurrentUser() u: AuthenticatedUser, @Param("id", idPipe) id: string) {
    return BusProfileDto.parse(await this.ops.busProfile(u, id));
  }
  @Patch("buses/:id")
  @Can("fleet:write")
  async patch(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(OpsBusPatch)) b: OpsBusPatch,
    @Req() r: Request,
  ) {
    return BusProfileDto.parse(await this.ops.patchBus(u, id, b, auditActorFromRequest(r)));
  }
  @Post("buses/:id/maintenance")
  @Can("fleet:write")
  async maintenance(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(MaintenanceInput)) b: MaintenanceInput,
    @Req() r: Request,
  ) {
    return MaintenanceDto.parse(await this.ops.maintenance(u, id, b, auditActorFromRequest(r)));
  }
  @Get("trips")
  @Can("ops:read")
  async trips(@CurrentUser() u: AuthenticatedUser, @Query(queryPipe) q: OpsQuery) {
    return z.array(OpsTripDto).parse(await this.ops.trips(u, q));
  }
  @Get("trips/:id")
  @Can("ops:read")
  async trip(@CurrentUser() u: AuthenticatedUser, @Param("id", idPipe) id: string) {
    return OpsTripProfileDto.parse(await this.ops.tripProfile(u, id));
  }
  @Post("trips/:id/assign")
  @Can("trip:assign")
  async assign(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(AssignTripInput)) b: AssignTripInput,
    @Req() r: Request,
  ) {
    return TripDto.parse(await this.ops.assign(u, id, b, auditActorFromRequest(r)));
  }
  @Post("trips/:id/replace-bus")
  @Can("trip:replace-bus")
  async replace(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(ReplaceBusInput)) b: ReplaceBusInput,
    @Req() r: Request,
  ) {
    return TripDto.parse(await this.ops.assign(u, id, b, auditActorFromRequest(r), true));
  }
  @Post("trips/:id/cancel")
  @Can("trip:cancel")
  async cancel(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(OpsReasonInput)) b: z.infer<typeof OpsReasonInput>,
    @Req() r: Request,
  ) {
    return TripDto.parse(await this.ops.cancel(u, id, b.reason, auditActorFromRequest(r)));
  }
  @Get("staff")
  @Can("ops:read")
  async staff(@CurrentUser() u: AuthenticatedUser, @Query(queryPipe) q: OpsQuery) {
    return z.array(StaffDto).parse(await this.ops.staff(u, q));
  }
  @Post("staff")
  @Can("staff:write")
  async createStaff(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(OpsStaffInput)) b: OpsStaffInput,
    @Req() r: Request,
  ) {
    return StaffDto.parse(await this.ops.createStaff(u, b, auditActorFromRequest(r)));
  }
  @Get("devices")
  @Can("ops:read")
  async devices(@CurrentUser() u: AuthenticatedUser, @Query(queryPipe) q: OpsQuery) {
    return z.array(DeviceDto).parse(await this.ops.devices(u, q));
  }
  @Post("devices/:id/approve")
  @Can("device:approve")
  async approve(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Req() r: Request,
  ) {
    return DeviceDto.parse(await this.ops.device(u, id, auditActorFromRequest(r)));
  }
  @Post("devices/:id/revoke")
  @Can("device:approve")
  async revoke(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Req() r: Request,
  ) {
    return DeviceDto.parse(await this.ops.device(u, id, auditActorFromRequest(r), true));
  }
  @Get("incidents")
  @Can("ops:read")
  async incidents(@CurrentUser() u: AuthenticatedUser, @Query(queryPipe) q: OpsQuery) {
    return z.array(IncidentDto).parse(await this.ops.incidents(u, q));
  }
  @Post("incidents/:id/acknowledge")
  @Can("incident:manage")
  async acknowledge(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Req() r: Request,
  ) {
    return IncidentDto.parse(await this.ops.incident(u, id, auditActorFromRequest(r)));
  }
  @Post("incidents/:id/resolve")
  @Can("incident:manage")
  async resolve(
    @CurrentUser() u: AuthenticatedUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodValidationPipe(ResolveIncidentInput)) b: z.infer<typeof ResolveIncidentInput>,
    @Req() r: Request,
  ) {
    return IncidentDto.parse(await this.ops.incident(u, id, auditActorFromRequest(r), b.note));
  }
}
