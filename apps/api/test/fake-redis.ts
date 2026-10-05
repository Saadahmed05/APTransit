/**
 * In memory stand in for RedisService.client in HTTP tests. Knows the commands and the Lua
 * scripts the API uses (rate limit window, seat-hold, seat-release). TTLs are ignored.
 */
export function createFakeRedis(store = new Map<string, string>()) {
  const client = {
    status: "ready",
    ping: async () => "PONG",
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    mget: async (...keys: (string | string[])[]) => keys.flat().map((k) => store.get(k) ?? null),
    del: async (...keys: string[]) => keys.filter((k) => store.delete(k)).length,
    incrby: async (key: string, amount: number) => {
      const next = Number(store.get(key) ?? 0) + amount;
      store.set(key, String(next));
      return next;
    },
    expire: async () => 1,
    sadd: async (key: string, ...members: string[]) => {
      const set = new Set(JSON.parse(store.get(key) ?? "[]") as string[]);
      const before = set.size;
      members.forEach((m) => set.add(m));
      store.set(key, JSON.stringify([...set]));
      return set.size - before;
    },
    srem: async (key: string, ...members: string[]) => {
      const set = new Set(JSON.parse(store.get(key) ?? "[]") as string[]);
      const removed = members.filter((m) => set.delete(m)).length;
      store.set(key, JSON.stringify([...set]));
      return removed;
    },
    smembers: async (key: string) => JSON.parse(store.get(key) ?? "[]") as string[],
    eval: async (script: string, numKeys: number, ...rest: string[]) => {
      const keys = rest.slice(0, numKeys);
      const argv = rest.slice(numKeys);
      if (script.includes("-- seat-hold")) {
        const seatKeys = keys.slice(0, -1);
        const taken = seatKeys.findIndex((k) => store.has(k));
        if (taken !== -1) return taken + 1;
        for (const k of seatKeys) store.set(k, argv[0]!);
        const countKey = keys[keys.length - 1]!;
        store.set(countKey, String(Number(store.get(countKey) ?? 0) + seatKeys.length));
        return 0;
      }
      if (script.includes("-- seat-release")) {
        let released = 0;
        for (const k of keys.slice(0, -1)) {
          if (store.get(k) === argv[0]) {
            store.delete(k);
            released++;
          }
        }
        const countKey = keys[keys.length - 1]!;
        const left = Number(store.get(countKey) ?? 0) - released;
        if (left <= 0) store.delete(countKey);
        else store.set(countKey, String(left));
        return released;
      }
      // Rate limit window script
      const key = keys[0]!;
      const hits = Number(store.get(key) ?? 0) + 1;
      store.set(key, String(hits));
      return [hits, Number(argv[0])];
    },
  };
  return { store, client, onModuleDestroy: async () => undefined };
}
