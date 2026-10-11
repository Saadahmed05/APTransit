import { canMoveComplaint, FeedbackInput, UpdateComplaintInput } from "@aptransit/shared";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../src/common/auth/auth.types";
import type { AuditService } from "../src/modules/audit/audit.service";
import { FeedbackService, normaliseRegNo } from "../src/modules/feedback/feedback.service";
import { renderComplaintEmail } from "../src/modules/notifications/email-template";
import type { NotificationsService } from "../src/modules/notifications/notifications.service";
import type { PrismaService } from "../src/prisma/prisma.service";

const staff: AuthenticatedUser = { id: "staff1", roles: [{ role: "DEPOT_STAFF", depotId: "dep_knl" }] };
const officer: AuthenticatedUser = { id: "do1", roles: [{ role: "DISTRICT_OFFICER", districtId: "dist_knl" }] };
const admin: AuthenticatedUser = { id: "sa1", roles: [{ role: "STATE_ADMIN", stateId: "state_ap" }] };
const root: AuthenticatedUser = { id: "root1", roles: [{ role: "SUPER_ADMIN" }] };

const complaint = (over: Record<string, unknown> = {}) => ({
  id: "cmp1",
  code: "CMP-ABC123",
  userId: "cit1",
  email: "ravi@example.com",
  category: "DELAY",
  status: "RECEIVED",
  message: "The bus was very late today.",
  ticketCode: null,
  busRegNo: null,
  routeCode: "KNL-VJA-01",
  travelDate: null,
  depotId: "dep_knl",
  assignedToId: null,
  resolutionNote: null,
  resolvedAt: null,
  createdAt: new Date("2026-10-07T04:00:00.000Z"),
  updatedAt: new Date("2026-10-07T04:00:00.000Z"),
  depot: { nameEn: "Kurnool depot", nameTe: "కర్నూలు డిపో" },
  ...over,
});

function setup(prismaOver: Record<string, unknown> = {}) {
  const notifications = { notify: vi.fn(), queueComplaintEmail: vi.fn() };
  const audit = { log: vi.fn() };
  const prisma = {
    complaint: {
      create: vi.fn(async ({ data }: { data: { code: string } }) => ({ id: "cmp1", code: data.code, status: "RECEIVED" })),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    ticket: { findUnique: vi.fn().mockResolvedValue(null) },
    bus: { findMany: vi.fn().mockResolvedValue([{ regNo: "AP 39 Z 0107", depotId: "dep_ndl" }]) },
    route: { findUnique: vi.fn().mockResolvedValue({ depotId: "dep_vja" }) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    userRole: { findMany: vi.fn().mockResolvedValue([]) },
    depot: { count: vi.fn().mockResolvedValue(0) },
    ...prismaOver,
  };
  const service = new FeedbackService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, notifications, audit };
}

const input = (over: Partial<FeedbackInput> = {}) =>
  FeedbackInput.parse({ email: "Ravi@Example.com", category: "DELAY", message: "The bus was very late today.", ...over });

describe("Day 16: feedback input", () => {
  it("normalises email, codes and empty optional fields", () => {
    const parsed = input({ ticketCode: "apt-ab12-cd34", routeCode: "knl-vja-01", busRegNo: "  " });
    expect(parsed.email).toBe("ravi@example.com");
    expect(parsed.ticketCode).toBe("APT-AB12-CD34");
    expect(parsed.routeCode).toBe("KNL-VJA-01");
    expect(parsed.busRegNo).toBeUndefined();
    expect(input({ travelDate: "" as never }).travelDate).toBeUndefined();
    expect(() => input({ travelDate: "2026-02-30" })).toThrow();
  });

  it("rejects short messages, bad ticket codes and unknown fields", () => {
    expect(() => input({ message: "late" })).toThrow();
    expect(() => input({ ticketCode: "TK12345" })).toThrow();
    expect(() => FeedbackInput.parse({ ...input(), userId: "x" })).toThrow();
  });

  it("requires a note to resolve and something to change", () => {
    expect(() => UpdateComplaintInput.parse({ status: "RESOLVED" })).toThrow(/resolution note/);
    expect(() => UpdateComplaintInput.parse({})).toThrow(/Nothing to change/);
    expect(UpdateComplaintInput.parse({ status: "RESOLVED", resolutionNote: "Driver counselled." }).status).toBe("RESOLVED");
  });

  it("moves one step at a time", () => {
    expect(canMoveComplaint("RECEIVED", "IN_REVIEW")).toBe(true);
    expect(canMoveComplaint("IN_REVIEW", "RESOLVED")).toBe(true);
    expect(canMoveComplaint("RESOLVED", "CLOSED")).toBe(true);
    expect(canMoveComplaint("RECEIVED", "RESOLVED")).toBe(false);
    expect(canMoveComplaint("CLOSED", "RECEIVED")).toBe(false);
    expect(canMoveComplaint("IN_REVIEW", "IN_REVIEW")).toBe(true);
  });
});

describe("Day 16: feedback service", () => {
  it("creates a RECEIVED complaint with a CMP code, the bus depot, and queues the confirmation", async () => {
    const { service, prisma, notifications } = setup();
    const out = await service.create(input({ busRegNo: "ap39z0107", routeCode: "VJA-GNT-01" }), undefined, "te");
    expect(out.code).toMatch(/^CMP-[0-9A-HJKMNP-Z]{6}$/);
    const data = prisma.complaint.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ userId: null, email: "ravi@example.com", status: "RECEIVED", depotId: "dep_ndl" });
    expect(notifications.queueComplaintEmail).toHaveBeenCalledWith({ complaintId: "cmp1", kind: "RECEIVED", locale: "te" }, "RECEIVED");
  });

  it("links a logged in sender and takes the depot from the route when nothing else matches", async () => {
    const { service, prisma } = setup({ bus: { findMany: vi.fn().mockResolvedValue([]) } });
    await service.create(input({ routeCode: "VJA-GNT-01" }), { id: "cit1", roles: [] }, "en");
    expect(prisma.complaint.create.mock.calls[0]![0].data).toMatchObject({ userId: "cit1", depotId: "dep_vja" });
  });

  it("returns NOT_FOUND for a wrong email without saying which part was wrong", async () => {
    const { service, prisma } = setup();
    prisma.complaint.findUnique.mockResolvedValue(complaint());
    await expect(service.status("CMP-ABC123", "other@example.com")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No complaint matches this code and email",
    });
    prisma.complaint.findUnique.mockResolvedValue(null);
    await expect(service.status("CMP-ZZZ999", "ravi@example.com")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No complaint matches this code and email",
    });
  });

  it("returns the status for a matching code and email", async () => {
    const { service, prisma } = setup();
    prisma.complaint.findUnique.mockResolvedValue(complaint({ status: "IN_REVIEW" }));
    await expect(service.status("CMP-ABC123", "RAVI@example.com")).resolves.toMatchObject({ code: "CMP-ABC123", status: "IN_REVIEW" });
  });

  it("scopes the ops list: depot staff to their depot, district officer to their district, state admin to the state, super admin to all", async () => {
    const { service, prisma } = setup();
    await service.list(staff, "RECEIVED");
    expect(prisma.complaint.findMany.mock.calls[0]![0].where).toEqual({ depot: { OR: [{ id: "dep_knl" }] }, status: "RECEIVED" });
    await service.list(officer);
    expect(prisma.complaint.findMany.mock.calls[1]![0].where).toEqual({ depot: { OR: [{ districtId: "dist_knl" }] } });
    await service.list(admin);
    // D-034: the state plus complaints without a depot (they have no place)
    expect(prisma.complaint.findMany.mock.calls[2]![0].where).toEqual({
      OR: [{ depot: { OR: [{ district: { stateId: "state_ap" } }] } }, { depotId: null }],
    });
    await service.list(root);
    expect(prisma.complaint.findMany.mock.calls[3]![0].where).toEqual({});
    await expect(service.list({ id: "c", roles: [{ role: "CITIZEN" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("moves a complaint, audits it and notifies the signed in citizen in both languages", async () => {
    const { service, prisma, notifications, audit } = setup();
    prisma.complaint.findFirst.mockResolvedValue(complaint());
    prisma.complaint.update.mockResolvedValue(complaint({ status: "IN_REVIEW" }));
    const dto = await service.update(staff, "cmp1", { status: "IN_REVIEW" }, { actorUserId: "staff1" });
    expect(dto.status).toBe("IN_REVIEW");
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "complaint.update", entityId: "cmp1" }));
    expect(notifications.notify).toHaveBeenCalledWith(
      "cit1",
      "COMPLAINT_UPDATE",
      { code: "CMP-ABC123", statusEn: "In review", statusTe: "పరిశీలనలో ఉంది" },
      "/feedback/status?code=CMP-ABC123",
      "complaint:cmp1:IN_REVIEW",
    );
  });

  it("emails a guest instead, and sets resolvedAt when resolving", async () => {
    const { service, prisma, notifications } = setup();
    prisma.complaint.findFirst.mockResolvedValue(complaint({ userId: null, status: "IN_REVIEW" }));
    prisma.complaint.update.mockResolvedValue(complaint({ userId: null, status: "RESOLVED", resolutionNote: "Driver counselled." }));
    await service.update(staff, "cmp1", { status: "RESOLVED", resolutionNote: "Driver counselled." }, {});
    expect(prisma.complaint.update.mock.calls[0]![0].data.resolvedAt).toBeInstanceOf(Date);
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(notifications.queueComplaintEmail).toHaveBeenCalledWith({ complaintId: "cmp1", kind: "UPDATE", locale: "en" }, "RESOLVED");
  });

  it("refuses skipping a step, and a complaint outside the scope", async () => {
    const { service, prisma } = setup();
    prisma.complaint.findFirst.mockResolvedValue(complaint());
    await expect(service.update(staff, "cmp1", { status: "CLOSED" }, {})).rejects.toMatchObject({ code: "COMPLAINT_STATUS_INVALID" });
    prisma.complaint.findFirst.mockResolvedValue(null);
    await expect(service.update(staff, "cmp1", { status: "IN_REVIEW" }, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an assignee without complaint:manage for the depot", async () => {
    const { service, prisma } = setup();
    prisma.complaint.findFirst.mockResolvedValue(complaint());
    prisma.userRole.findMany.mockResolvedValue([{ role: "CITIZEN", depotId: null, districtId: null }]);
    await expect(service.update(staff, "cmp1", { assignedToId: "cit9" }, {})).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("Day 16: complaint email", () => {
  it("renders the received email in Telugu with the code and the status link", () => {
    const mail = renderComplaintEmail("te", "RECEIVED", { code: "CMP-ABC123", status: "RECEIVED", resolutionNote: null }, "https://web.example");
    expect(mail.subject).toContain("CMP-ABC123");
    expect(mail.text).toContain("https://web.example/feedback/status?code=CMP-ABC123");
    expect(mail.html).toContain('lang="te"');
  });

  it("adds the depot note on updates and escapes it in HTML", () => {
    const mail = renderComplaintEmail("en", "UPDATE", { code: "CMP-ABC123", status: "RESOLVED", resolutionNote: "<b>Fixed</b>" }, "https://web.example");
    expect(mail.text).toContain("now: Resolved");
    expect(mail.text).toContain("Note from the depot: <b>Fixed</b>");
    expect(mail.html).toContain("&lt;b&gt;Fixed&lt;/b&gt;");
  });

  it("matches bus numbers typed without spaces", () => {
    expect(normaliseRegNo("ap 39 z 0107")).toBe(normaliseRegNo("AP39Z0107"));
  });
});
