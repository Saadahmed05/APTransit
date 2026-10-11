import { type BusPositionEvent, type Role, SubscribeInput } from "@aptransit/shared";
import { Logger, Optional, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { OpsService } from "../ops/ops.service";
import { ConfigService } from "@nestjs/config";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import * as jose from "jose";
import type { Namespace, Socket } from "socket.io";
import type { AuthenticatedUser } from "../../common/auth/auth.types";
import { DomainEventsService, type LiveRooms } from "../../common/events/domain-events.service";
import { PLATFORM_ROLES, ScopeService, STATE_ROLES } from "../../common/services/scope.service";
import type { Env } from "../../config/env";
import { TrackingService } from "./tracking.service";

/** docs/06 WebSocket: at most one bus:position per trip per 2 s, the state rooms one per 10 s. */
export const POSITION_THROTTLE_MS = 2_000;
export const STATE_THROTTLE_MS = 10_000;

const DISTRICT_ROLES: ReadonlySet<Role> = new Set(["DISTRICT_OFFICER", ...STATE_ROLES, ...PLATFORM_ROLES]);
const OPS_ROLES: ReadonlySet<Role> = new Set(["DEPOT_STAFF", "DEPOT_MANAGER", ...DISTRICT_ROLES]);

type SocketData = { user: AuthenticatedUser | null };
type Ack = { ok: true } | { ok: false; error: "FORBIDDEN" | "VALIDATION_FAILED" };

const roomList = (rooms: LiveRooms) => [`trip:${rooms.tripId}`, `route:${rooms.routeId}`, `depot:${rooms.depotId}`, `district:${rooms.districtId}`];
/** The state room of a trip (D-034): state:{id}. Web and API deploy together for this name. */
const stateRoom = (rooms: LiveRooms) => `state:${rooms.stateId}`;

/**
 * Socket.IO namespace /live (docs/06, docs/13). The JWT in handshake auth is optional: anonymous
 * sockets may follow trips and routes; authenticated ones also join user:{id}. Depot, district and
 * state:{id} rooms need a scoped role. Emits come from domain events, so services never hold sockets.
 */
@WebSocketGateway({ namespace: "/live", cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true } })
export class LiveGateway implements OnGatewayInit, OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server?: Namespace;
  private readonly logger = new Logger(LiveGateway.name);
  private readonly jwtSecret: Uint8Array;
  private readonly lastPosition = new Map<string, number>();
  private readonly lastStatePosition = new Map<string, number>();
  private readonly off: (() => void)[] = [];
  private kpiTimer?: ReturnType<typeof setInterval>;
  private kpiBusy = false;

  constructor(
    config: ConfigService<Env, true>,
    private readonly events: DomainEventsService,
    private readonly tracking: TrackingService,
    private readonly scope: ScopeService,
    @Optional() private readonly ops?: OpsService,
  ) {
    this.jwtSecret = new TextEncoder().encode(config.get("JWT_SECRET", { infer: true }));
  }

  onModuleInit(): void {
    this.off.push(
      this.events.on("incident.updated", ({rooms,...payload}) => this.emitTo(roomList(rooms).concat(stateRoom(rooms)), "incident:update", payload)),
      this.events.on("conductor.scan", e => this.emitTo(["trip:"+e.tripId], "conductor:counts", e)),
    );
    this.kpiTimer = setInterval(() => { void this.pushKpis(); }, 15_000);
    this.kpiTimer.unref();
    this.off.push(
      this.events.on("notification.created", (e) => this.emitTo([`user:${e.userId}`], "notification:new", e.notification)),
      this.events.on("bus.position", (event) => this.emitPosition(event)),
      this.events.on("trip.status", ({ rooms, ...payload }) => this.emitTo([...roomList(rooms).filter((r) => !r.startsWith("route:")), stateRoom(rooms)], "trip:status", payload)),
      this.events.on("incident.created", ({ rooms, ...payload }) =>
        this.emitTo([`trip:${rooms.tripId}`, `depot:${rooms.depotId}`, `district:${rooms.districtId}`, stateRoom(rooms)], "incident:new", payload),
      ),
      this.events.on("ticket.status", (e) => this.emitTo([`user:${e.holderUserId}`], "ticket:status", { ticketId: e.ticketId, status: e.to })),
    );
  }

  onModuleDestroy(): void {
    this.off.forEach((unsubscribe) => unsubscribe());
    clearInterval(this.kpiTimer);
  }

  async pushKpis(): Promise<void> {
    if (!this.ops || !this.server || this.kpiBusy) return;
    const rooms = [...(this.server.adapter?.rooms?.entries() ?? [])]
      .filter(([room,members]) => members.size > 0 && (room.startsWith("depot:") || room.startsWith("state:")))
      .map(([room]) => room);
    if (!rooms.length) return;
    this.kpiBusy = true;
    try {
      for (const room of rooms) {
        // A state room gets that state's totals, a depot room its depot
        const values = room.startsWith("state:")
          ? await this.ops.dashboard({ id: "socket-kpi-service", roles: [{ role: "STATE_ADMIN", stateId: room.slice(6) }] }, {})
          : await this.ops.dashboard({ id: "socket-kpi-service", roles: [{ role: "SUPER_ADMIN" }] }, { depotId: room.slice(6) });
        this.emitTo([room], "kpi:update", {scope:room,values});
      }
    } catch { this.logger.warn("KPI update failed"); }
    finally { this.kpiBusy = false; }
  }

  /**
   * The token is checked in middleware, before the connection is accepted, so a `subscribe` sent
   * right after connect never runs before the user is known (that race refused scoped rooms).
   */
  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticate(socket).then(() => next());
    });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const data = socket.data as SocketData & { authFailed?: boolean };
    if (data.user) await socket.join(`user:${data.user.id}`);
    // A bad or expired token is an anonymous socket, not an error: public rooms still work
    if (data.authFailed) socket.emit("auth:error", { code: "UNAUTHENTICATED" });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const data = socket.data as SocketData & { authFailed?: boolean };
    data.user = null;
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || token.length === 0) return;
    try {
      const { payload } = await jose.jwtVerify(token, this.jwtSecret);
      if (!payload.sub) throw new Error("no subject");
      data.user = { id: payload.sub, roles: (payload as { roles?: AuthenticatedUser["roles"] }).roles ?? [] };
    } catch {
      data.authFailed = true;
    }
  }

  @SubscribeMessage("subscribe")
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = SubscribeInput.safeParse(body);
    if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };
    const { room } = parsed.data;
    if (!(await this.mayJoin((socket.data as SocketData).user, room))) return { ok: false, error: "FORBIDDEN" };
    await socket.join(room);
    return { ok: true };
  }

  @SubscribeMessage("unsubscribe")
  async unsubscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = SubscribeInput.safeParse(body);
    if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };
    await socket.leave(parsed.data.room);
    return { ok: true };
  }

  /** Room rules from docs/06 and docs/13. */
  async mayJoin(user: AuthenticatedUser | null, room: string): Promise<boolean> {
    if (room.startsWith("trip:") || room.startsWith("route:")) return true;
    if (!user) return false;
    const roles = user.roles;
    const [kind, id] = room.split(":") as [string, string];
    if (kind === "state") return roles.some((r) => PLATFORM_ROLES.has(r.role) || (STATE_ROLES.has(r.role) && r.stateId === id));
    if (kind === "district") {
      try {
        await this.scope.assertDistrictAccess({ ...user, roles: roles.filter((r) => DISTRICT_ROLES.has(r.role)) }, id);
        return true;
      } catch {
        return false;
      }
    }
    if (kind === "depot") {
      if (!roles.some((r) => OPS_ROLES.has(r.role))) return false;
      try {
        await this.tracking.assertDepotScope({ ...user, roles: roles.filter((r) => OPS_ROLES.has(r.role)) }, id);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** bus:position to trip, route, depot and district at most every 2 s per trip, state:{id} every 10 s. */
  private emitPosition({ rooms, ...payload }: BusPositionEvent & { rooms: LiveRooms }): void {
    const now = Date.now();
    const tripId = rooms.tripId;
    if (now - (this.lastPosition.get(tripId) ?? 0) >= POSITION_THROTTLE_MS) {
      this.lastPosition.set(tripId, now);
      this.emitTo(roomList(rooms), "bus:position", payload);
    }
    if (now - (this.lastStatePosition.get(tripId) ?? 0) >= STATE_THROTTLE_MS) {
      this.lastStatePosition.set(tripId, now);
      this.emitTo([stateRoom(rooms)], "bus:position", payload);
    }
  }

  private emitTo(rooms: string[], event: string, payload: unknown): void {
    // The worker process has no socket server: events there are simply not broadcast
    if (!this.server) return;
    try {
      this.server.to(rooms).emit(event, payload);
    } catch (err) {
      this.logger.warn(`Socket emit ${event} failed: ${(err as Error).message}`);
    }
  }
}
