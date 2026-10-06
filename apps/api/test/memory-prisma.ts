/* eslint-disable @typescript-eslint/no-explicit-any */
// A small in memory stand in for PrismaService in HTTP tests. Supports the query shapes our services
// use: where with equals, in, notIn, not, gt, gte, lt, lte, OR, AND and relation filters; include and
// select of relations (through `relations`); data with increment; count; $transaction with rollback.
// Select is treated like include (extra fields never hurt a test).

type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;
/** model to relation name to resolver(row, tables). */
export type Relations = Record<string, Record<string, (row: Row, tables: Tables) => unknown>>;
/** model to defaults applied on create. Functions are called per row. */
export type Defaults = Record<string, Record<string, unknown | (() => unknown)>>;

let seq = 0;
export const memoryId = (prefix = "m") =>
  `${prefix}${String(++seq).padStart(12, "0")}`.slice(0, 24);

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !(value instanceof Date) && !Array.isArray(value);

const time = (value: unknown) => (value instanceof Date ? value.getTime() : value);

function matchValue(actual: unknown, cond: unknown): boolean {
  if (!isPlainObject(cond)) return time(actual) === time(cond);
  if (Array.isArray(cond.path)) { const {path,...rest}=cond;const selected=path.reduce((v: any,k: string)=>v?.[k],actual);return matchValue(selected,rest); }
  return Object.entries(cond).every(([op, expected]) => {
    switch (op) {
      case "mode": return true;
      case "contains": return typeof actual === "string" && (cond.mode === "insensitive" ? actual.toLowerCase().includes(String(expected).toLowerCase()) : actual.includes(String(expected)));
      case "equals":
        return time(actual) === time(expected);
      case "in":
        return (expected as unknown[]).some((e) => time(e) === time(actual));
      case "notIn":
        return !(expected as unknown[]).some((e) => time(e) === time(actual));
      case "not":
        return isPlainObject(expected)
          ? !matchValue(actual, expected)
          : time(actual) !== time(expected);
      case "gt":
        return (
          actual !== null &&
          actual !== undefined &&
          (time(actual) as number) > (time(expected) as number)
        );
      case "gte":
        return (
          actual !== null &&
          actual !== undefined &&
          (time(actual) as number) >= (time(expected) as number)
        );
      case "lt":
        return (
          actual !== null &&
          actual !== undefined &&
          (time(actual) as number) < (time(expected) as number)
        );
      case "lte":
        return (
          actual !== null &&
          actual !== undefined &&
          (time(actual) as number) <= (time(expected) as number)
        );
      case "has":
        return Array.isArray(actual) && actual.includes(expected);
      default:
        throw new Error(`memory-prisma: unsupported operator ${op}`);
    }
  });
}

/** model to relation field to the child model and its foreign key, for nested `create` in data. */
export type Nested = Record<string, Record<string, { model: string; fk: string }>>;

export function createMemoryPrisma(
  tables: Tables,
  relations: Relations = {},
  defaults: Defaults = {},
  nested: Nested = {},
) {
  const matches = (model: string, row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (cond === undefined) return true;
      if (key === "OR") return (cond as Row[]).some((w) => matches(model, row, w));
      if (key === "AND") return (cond as Row[]).every((w) => matches(model, row, w));
      if (key === "NOT") return !matches(model, row, cond as Row);
      const resolver = relations[model]?.[key];
      if (resolver) {
        const related = resolver(row, tables);
        if (Array.isArray(related)) {
          if (isPlainObject(cond) && "some" in cond)
            return related.some((r) => matchesPlain(r as Row, cond.some));
          if (isPlainObject(cond) && "none" in cond)
            return !related.some((r) => matchesPlain(r as Row, cond.none));
          return false;
        }
        if (cond === null) return related === null || related === undefined;
        return (
          related !== null && related !== undefined && matchesPlain(related as Row, cond as Row)
        );
      }
      return matchValue(row[key] ?? null, cond);
    });
  const matchesPlain = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([k, c]) => {
      if (c === undefined) return true;
      if (k === "OR") return (c as Row[]).some((w) => matchesPlain(row, w));
      if (k === "AND") return (c as Row[]).every((w) => matchesPlain(row, w));
      if (k === "NOT") return !matchesPlain(row, c as Row);
      const value = row[k] ?? null;
      if (Array.isArray(value) && isPlainObject(c)) {
        if ("some" in c) return value.some((v) => matchesPlain(v, c.some));
        if ("none" in c) return !value.some((v) => matchesPlain(v, c.none));
      }
      if (isPlainObject(value) && isPlainObject(c)) return matchesPlain(value, c);
      return matchValue(value, c);
    });

  const shape = (model: string, row: Row, args: Row = {}): Row => {
    const spec = args.include ?? args.select;
    const out = { ...row };
    if (spec) {
      for (const [name, value] of Object.entries(spec)) {
        if (!value) continue;
        const resolver = relations[model]?.[name];
        if (resolver) {
          let related = resolver(row, tables);
          if (Array.isArray(related) && isPlainObject(value)) {
            related = sortRows(
              related.filter((r) => matchesPlain(r, value.where ?? {})),
              value.orderBy,
            );
            if (value.take !== undefined) related = (related as Row[]).slice(0, value.take);
          }
          out[name] = related;
        }
      }
    }
    return out;
  };

  const sortRows = (rows: Row[], orderBy: Row | Row[] | undefined) => {
    const orders = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const [key, dir] = Object.entries(order)[0] as [string, "asc" | "desc"];
        const av = time(a[key]) as number;
        const bv = time(b[key]) as number;
        if (av === bv) continue;
        const sign = dir === "desc" ? -1 : 1;
        if (av === null || av === undefined) return sign;
        if (bv === null || bv === undefined) return -sign;
        return av < bv ? -sign : sign;
      }
      return 0;
    });
  };

  const applyData = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (isPlainObject(value) && "increment" in value)
        row[key] = (row[key] ?? 0) + value.increment;
      else if (isPlainObject(value) && "decrement" in value)
        row[key] = (row[key] ?? 0) - value.decrement;
      else if (isPlainObject(value) && ("connect" in value || "create" in value)) continue;
      else row[key] = value;
    }
    if ("updatedAt" in row) row.updatedAt = new Date();
  };

  const delegate = (model: string) => {
    const table = () => (tables[model] ??= []);
    const findMany = async (args: Row = {}) => {
      let rows = table().filter((r) => matches(model, r, args.where));
      rows = sortRows(rows, args.orderBy);
      if (args.cursor) { const at=rows.findIndex(r=>matchesPlain(r,args.cursor));rows=at>=0?rows.slice(at):[]; }
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map((r) => shape(model, r, args));
    };
    return {
      findMany,
      findFirst: async (args: Row = {}) => (await findMany({ ...args, take: 1 }))[0] ?? null,
      findUnique: async (args: Row) => {
        const row = table().find((r) => matches(model, r, args.where));
        return row ? shape(model, row, args) : null;
      },
      findUniqueOrThrow: async (args: Row) => {
        const row = table().find((r) => matches(model, r, args.where));
        if (!row) throw new Error("memory-prisma: missing " + model);
        return shape(model, row, args);
      },
      count: async (args: Row = {}) => table().filter((r) => matches(model, r, args.where)).length,
      create: async (args: Row) => {
        const base: Row = { id: memoryId(model.slice(0, 3)), createdAt: new Date() };
        for (const [key, value] of Object.entries(defaults[model] ?? {}))
          base[key] = typeof value === "function" ? (value as () => unknown)() : value;
        const row = { ...base };
        applyData(row, args.data);
        table().push(row);
        for (const [field, value] of Object.entries(args.data as Row)) {
          const child = nested[model]?.[field];
          if (!child || !isPlainObject(value) || !("create" in value)) continue;
          const items = Array.isArray(value.create) ? value.create : [value.create];
          for (const item of items as Row[])
            (tables[child.model] ??= []).push({
              id: memoryId(child.model.slice(0, 3)),
              createdAt: new Date(),
              ...item,
              [child.fk]: row.id,
            });
        }
        return shape(model, row, args);
      },
      createMany: async (args: Row) => {
        for (const data of args.data as Row[]) {
          const row: Row = {
            id: memoryId(model.slice(0, 3)),
            createdAt: new Date(),
            ...(defaults[model] ?? {}),
          };
          applyData(row, data);
          table().push(row);
        }
        return { count: (args.data as Row[]).length };
      },
      update: async (args: Row) => {
        const row = table().find((r) => matches(model, r, args.where));
        if (!row) throw new Error(`memory-prisma: ${model} not found for update`);
        applyData(row, args.data);
        return shape(model, row, args);
      },
      updateMany: async (args: Row) => {
        const rows = table().filter((r) => matches(model, r, args.where));
        rows.forEach((r) => applyData(r, args.data));
        return { count: rows.length };
      },
      upsert: async (args: Row) => {
        const row = table().find((r) => matches(model, r, args.where));
        if (row) {
          applyData(row, args.update);
          return shape(model, row, args);
        }
        const created: Row = { id: memoryId(model.slice(0, 3)), createdAt: new Date() };
        applyData(created, args.create);
        table().push(created);
        return shape(model, created, args);
      },
      delete: async (args: Row) => {
        const index = table().findIndex((r) => matches(model, r, args.where));
        const [row] = table().splice(index, 1);
        return row;
      },
      deleteMany: async (args: Row = {}) => {
        const keep = table().filter((r) => !matches(model, r, args.where));
        const count = table().length - keep.length;
        tables[model] = keep;
        return { count };
      },
    };
  };

  const prisma: any = new Proxy(
    {
      $queryRaw: async () => [1],
      $executeRaw: async () => 0,
      $connect: async () => undefined,
      onModuleDestroy: async () => undefined,
      $transaction: async (arg: any) => {
        if (Array.isArray(arg)) return Promise.all(arg);
        const snapshot = Object.fromEntries(
          Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]),
        );
        try {
          return await arg(prisma);
        } catch (err) {
          for (const key of Object.keys(tables)) delete tables[key];
          Object.assign(tables, snapshot);
          throw err;
        }
      },
    },
    {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        if (typeof prop !== "string" || prop === "then") return undefined;
        return delegate(prop);
      },
    },
  );
  return prisma;
}
