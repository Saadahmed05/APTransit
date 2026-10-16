import { SAVED_ROUTES_MAX, type SaveRouteInput, type SavedRouteDto } from "@aptransit/shared";
import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors/app-error";
import { PrismaService } from "../../prisma/prisma.service";

const STOP = { select: { id: true, nameEn: true, nameTe: true } } as const;

/** D-048: a citizen's saved routes (home sheet and account). */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async savedRoutes(userId: string): Promise<SavedRouteDto[]> {
    const rows = await this.prisma.savedRoute.findMany({
      where: { userId },
      include: { fromStop: STOP, toStop: STOP },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({ id: r.id, from: r.fromStop, to: r.toStop, createdAt: r.createdAt.toISOString() }));
  }

  /** Saving a pair twice returns the one already saved. */
  async saveRoute(userId: string, input: SaveRouteInput): Promise<SavedRouteDto> {
    const stops = await this.prisma.stop.count({ where: { id: { in: [input.fromStopId, input.toStopId] } } });
    if (stops !== 2) throw new AppError("NOT_FOUND", "Stop not found");
    const existing = await this.prisma.savedRoute.findUnique({
      where: { userId_fromStopId_toStopId: { userId, fromStopId: input.fromStopId, toStopId: input.toStopId } },
      include: { fromStop: STOP, toStop: STOP },
    });
    const row =
      existing ??
      (await (async () => {
        if ((await this.prisma.savedRoute.count({ where: { userId } })) >= SAVED_ROUTES_MAX)
          throw new AppError("VALIDATION_FAILED", `At most ${SAVED_ROUTES_MAX} saved routes`);
        return this.prisma.savedRoute.create({
          data: { userId, fromStopId: input.fromStopId, toStopId: input.toStopId },
          include: { fromStop: STOP, toStop: STOP },
        });
      })());
    return { id: row.id, from: row.fromStop, to: row.toStop, createdAt: row.createdAt.toISOString() };
  }

  async deleteRoute(userId: string, id: string): Promise<void> {
    const result = await this.prisma.savedRoute.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new AppError("NOT_FOUND", "Saved route not found");
  }
}
