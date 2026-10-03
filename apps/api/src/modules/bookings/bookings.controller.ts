import type { BookingDto } from "@aptransit/shared";
import { CreateBookingInput, PublicId } from "@aptransit/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { Audit } from "../../common/decorators/audit.decorator";
import { Can } from "../../common/decorators/can.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { BookingsService } from "./bookings.service";

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // docs/12: 10 per user per 10 min
  @Post()
  @Can("booking:create")
  @Audit("booking.create")
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @HttpCode(HttpStatus.CREATED)
  createBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateBookingInput)) body: CreateBookingInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<BookingDto> {
    return this.bookingsService.createBooking(user.id, body, idempotencyKey);
  }

  @Get(":id")
  getBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
  ): Promise<BookingDto> {
    return this.bookingsService.getBooking(user.id, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(PublicId)) id: string,
  ): Promise<void> {
    await this.bookingsService.cancelPendingBooking(user.id, id);
  }
}
