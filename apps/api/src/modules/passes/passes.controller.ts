import { CreatePassInput, type PassDto, type PassQrDto, type PassTypeDto, PublicId } from "@aptransit/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { auditActorFromRequest } from "../audit/audit.service";
import { PassesService } from "./passes.service";

@Controller("pass-types")
export class PassTypesController {
  constructor(private readonly passes: PassesService) {}

  @Public()
  @Get()
  list(): Promise<PassTypeDto[]> {
    return this.passes.listTypes();
  }
}

/** docs/06 Passes. Owner only: the service loads passes by id and owner together. */
@Controller("passes")
@Can("pass:own")
export class PassesController {
  constructor(private readonly passes: PassesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PassDto[]> {
    return this.passes.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePassInput)) body: CreatePassInput,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<PassDto> {
    return this.passes.create(user.id, body.passTypeId, auditActorFromRequest(req));
  }

  @Post(":id/activate")
  @HttpCode(HttpStatus.OK)
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ): Promise<PassDto> {
    return this.passes.activate(user.id, id, auditActorFromRequest(req));
  }

  @Get(":id/qr")
  qr(@CurrentUser() user: AuthenticatedUser, @Param("id", new ZodValidationPipe(PublicId)) id: string): Promise<PassQrDto> {
    return this.passes.qrFor(user.id, id);
  }
}
