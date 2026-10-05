import type { TicketDto } from "@aptransit/shared";

// docs/11 /tickets/[id] and the Day 8 prompt: an ACTIVE ticket keeps working offline. We keep
// { ticket, token, rotSecret, serverOffset } in IndexedDB only until validUntil, and delete it all
// on logout. Every call is wrapped: private windows and blocked storage simply mean "no cache".

const DB_NAME = "apt-offline";
const STORE = "tickets";
const VERSION = 1;

export interface OfflineTicket {
  id: string;
  ticket: TicketDto;
  qr: { token: string; rotSecret: string; periodSec: number; serverOffsetMs: number };
  /** ISO; the entry is deleted after this. */
  validUntil: string;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request ? (request.result ?? null) : null);
      };
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
      tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

const isLive = (entry: OfflineTicket, nowMs: number) => Date.parse(entry.validUntil) > nowMs;

export async function saveOfflineTicket(entry: OfflineTicket): Promise<void> {
  if (!isLive(entry, Date.now())) return;
  await run("readwrite", (store) => store.put(entry));
}

/** The cached ticket, or null. Expired entries are removed on the way. */
export async function readOfflineTicket(id: string): Promise<OfflineTicket | null> {
  const entry = (await run<OfflineTicket>("readonly", (store) => store.get(id))) ?? null;
  if (entry && !isLive(entry, Date.now())) {
    await removeOfflineTicket(id);
    return null;
  }
  return entry;
}

/** Every cached ticket still valid now (the /offline page lists these). */
export async function listOfflineTickets(): Promise<OfflineTicket[]> {
  const all = (await run<OfflineTicket[]>("readonly", (store) => store.getAll())) ?? [];
  const now = Date.now();
  const expired = all.filter((entry) => !isLive(entry, now));
  for (const entry of expired) await removeOfflineTicket(entry.id);
  return all.filter((entry) => isLive(entry, now));
}

export async function removeOfflineTicket(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}

/** Logout: nothing of the old session stays on the device. */
export async function clearOfflineTickets(): Promise<void> {
  await run("readwrite", (store) => store.clear());
}
