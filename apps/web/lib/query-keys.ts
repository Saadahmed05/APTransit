// One place for React Query keys, so invalidation never misses a spelling.
export const queryKeys = {
  me: ["me"] as const,
  sessionBootstrap: ["session", "bootstrap"] as const,
  places: (q: string) => ["places", q.toLowerCase()] as const,
  searchTrips: (query: { from: string; to: string; date: string; after?: string }) =>
    ["search", "trips", query.from, query.to, query.date, query.after ?? ""] as const,
  trip: (id: string, from?: string, to?: string) =>
    ["trip", id, from ?? "", to ?? ""] as const,
  tripFare: (id: string, from: string, to: string) =>
    ["trip", id, "fare", from, to] as const,
  tripSeats: (id: string, from?: string, to?: string) =>
    ["trip", id, "seats", from ?? "", to ?? ""] as const,
  districts: ["network", "districts"] as const,
  busStands: (districtId?: string) =>
    ["network", "bus-stands", districtId ?? ""] as const,
  routes: (busStandId?: string) =>
    ["network", "routes", busStandId ?? ""] as const,
  route: (id: string) => ["network", "route", id] as const,
  booking: (id: string) => ["booking", id] as const,
  timetable: (routeId: string, date: string) =>
    ["network", "timetable", routeId, date] as const,
};

