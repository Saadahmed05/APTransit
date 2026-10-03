import type { BookingDto } from "@aptransit/shared";
import { CreateBookingInput } from "@aptransit/shared";
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
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AppError } from "../../common/errors/app-error";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { BookingsService } from "./bookings.service";

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  createBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateBookingInput)) body: CreateBookingInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<BookingDto> {
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }
    return this.bookingsService.createBooking(user.id, body, idempotencyKey);
  }

  @Get(":id")
  getBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<BookingDto> {
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }
    return this.bookingsService.getBooking(user.id, id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<void> {
    if (!user) {
      throw new AppError("UNAUTHENTICATED", "Authentication required");
    }
    await this.bookingsService.cancelPendingBooking(user.id, id);
  }
}
