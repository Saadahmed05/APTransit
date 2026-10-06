import { z } from "zod";

export const ReportKind = z.enum([
  "daily-operations",
  "route-performance",
  "complaints",
  "tickets",
]);
export type ReportKind = z.infer<typeof ReportKind>;

export const ReportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ReportQuery = z.infer<typeof ReportQuery>;
