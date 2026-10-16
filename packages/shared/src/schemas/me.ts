import { z } from "zod";
import { PublicId } from "./search";

/** D-048: a saved From and To pair (home sheet and account). */
export const SavedRouteStop = z.object({ id: z.string(), nameEn: z.string(), nameTe: z.string() });
export const SavedRouteDto = z.object({
  id: z.string(),
  from: SavedRouteStop,
  to: SavedRouteStop,
  createdAt: z.string().datetime(),
});
export type SavedRouteDto = z.infer<typeof SavedRouteDto>;
export const SavedRoutesResponse = z.array(SavedRouteDto);

/** A citizen keeps at most this many saved routes. */
export const SAVED_ROUTES_MAX = 10;

export const SaveRouteInput = z
  .object({ fromStopId: PublicId, toStopId: PublicId })
  .strict()
  .refine((r) => r.fromStopId !== r.toStopId, { path: ["toStopId"], message: "From and To must differ" });
export type SaveRouteInput = z.infer<typeof SaveRouteInput>;
