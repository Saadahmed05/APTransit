# 08 · Roles and permissions

**Status: LOCKED.** Source: plan sec 3, 49, 50, 71. Each role gets only the access it needs.

## Roles and scope

| Role | Group | Scope | Home route after login |
| --- | --- | --- | --- |
| CITIZEN | Field | Own data | `/` |
| DRIVER | Field | Own assignments | `/driver` |
| CONDUCTOR | Field | Own assignments | `/conductor` |
| DEPOT_STAFF | Field | One depot (`depotId`) | `/ops` |
| DEPOT_MANAGER | Management | One depot (`depotId`) | `/ops` |
| DISTRICT_OFFICER | Management | One district (`districtId`) | `/gov` |
| TRANSPORT_OFFICER | Management | One whole state (`stateId`), read only | `/gov` |
| STATE_ADMIN | Admin | One whole state (`stateId`) | `/admin` |
| SUPER_ADMIN | Admin | Every state (platform wide), including roles of admins | `/admin` |

- Every user is a CITIZEN. Staff roles are added on top by an admin.
- A user with several roles sees a role switcher in the account menu. Default is the highest role.
- Scope check is on the server for every request: a DEPOT_MANAGER of Kurnool gets 403 `FORBIDDEN` on a Nandyal bus.
- State scope (D-034): the network is State > District > Depot. A state role sees every depot of its state (`depot.district.stateId`) and nothing in another state; a state role without a `stateId` sees nothing. SUPER_ADMIN is the only platform wide role and picks a state on `/gov`. A STATE_ADMIN grants roles only inside their own state. Complaints without a depot have no place, so state and platform roles see them. Code: `depotScopeWhere`, `wholeStates` and `ScopeService.assertStateAccess` in `apps/api/src/common/services/scope.service.ts`.

## Permission keys

Defined once in `packages/shared/src/permissions.ts`. The API guard `@Can('trip:assign')` and the web helper `can(user, 'trip:assign')` both read this file.

| Permission | CIT | DRV | CON | DST | DMG | DOF | TOF | SAD | SUP |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `booking:create`, `ticket:own`, `pass:own`, `feedback:create` | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| `driver:trip` (start, end, ping, incident) | | Y | | | | | | | |
| `ticket:validate`, `conductor:manifest` | | | Y | | | | | | |
| `ops:read` (dashboard, buses, trips, incidents) | | | | Y | Y | Y | Y | Y | Y |
| `incident:manage` (acknowledge, resolve) | | | | Y | Y | | | Y | Y |
| `trip:assign`, `trip:replace-bus` | | | | Y | Y | | | Y | Y |
| `trip:cancel` | | | | | Y | | | Y | Y |
| `fleet:write` (buses, maintenance) | | | | | Y | | | Y | Y |
| `staff:write` (drivers, conductors) | | | | | Y | | | Y | Y |
| `device:approve` | | | | | Y | | | Y | Y |
| `complaint:manage` | | | | Y | Y | Y | | Y | Y |
| `gov:read` (command center, analytics, drill down) | | | | | | Y | Y | Y | Y |
| `report:export` | | | | | Y | Y | Y | Y | Y |
| `network:write` (stops, routes, timetables, trip generation) | | | | | | | | Y | Y |
| `policy:write` (fares, refund policy, settings) | | | | | | | | Y | Y |
| `user:roles` (assign staff roles) | | | | | | | | Y | Y |
| `user:roles:admin` (assign STATE_ADMIN or SUPER_ADMIN) | | | | | | | | | Y |
| `audit:read` | | | | | Y | Y | Y | Y | Y |

Column key: CIT citizen, DRV driver, CON conductor, DST depot staff, DMG depot manager, DOF district officer, TOF transport officer, SAD state admin, SUP super admin.

## Web route guards

| Route prefix | Needs |
| --- | --- |
| `/`, `/search`, `/bus/*`, `/timetable/*`, `/track/*`, `/feedback` | Public |
| `/book/*`, `/tickets/*`, `/passes/*`, `/free-travel`, `/account`, `/updates` | Logged in |
| `/driver/*` | `driver:trip` |
| `/conductor/*` | `ticket:validate` |
| `/ops/*` | `ops:read` (write buttons hidden without the matching permission) |
| `/gov/*` | `gov:read` |
| `/admin/*` | `network:write` or `policy:write` or `user:roles` |
| `/design` | Development only |

Guards run in Next.js middleware (fast redirect to `/login?next=`) and again in the API (the real check). Hidden buttons are a UX nicety, never a security control.

## Sensitive actions (always audited, plan sec 50)

Role changes, fare rule changes, refund policy changes, settings changes, trip cancel, bus replacement, device approve or revoke, incident resolve, ticket transfer, manual refund, any admin delete or deactivate.

## Seed accounts (dev and staging only)

Created by `pnpm db:seed`. Login by email OTP. With `OTP_DEV_ECHO=1` the code is printed in the API log.

| Email | Roles | Scope |
| --- | --- | --- |
| citizen@aptransit.test | CITIZEN | |
| citizen2@aptransit.test | CITIZEN | (gift recipient) |
| driver.knl@aptransit.test | DRIVER | Kurnool depot |
| conductor.knl@aptransit.test | CONDUCTOR | Kurnool depot |
| staff.knl@aptransit.test | DEPOT_STAFF | Kurnool depot |
| manager.knl@aptransit.test | DEPOT_MANAGER | Kurnool depot |
| officer.knl@aptransit.test | DISTRICT_OFFICER | Kurnool district |
| transport@aptransit.test | TRANSPORT_OFFICER | Andhra Pradesh |
| admin@aptransit.test | STATE_ADMIN | Andhra Pradesh |
| root@aptransit.test | SUPER_ADMIN | All states |
| admin.tg@aptransit.test | STATE_ADMIN | Telangana (only with `pnpm db:seed --with-tg`) |

`.test` is a reserved domain, so these can never receive real email. In dev the email provider logs instead of sending for `.test` addresses.
