import type { GpsPointInput } from "@aptransit/shared";

// docs/13: when offline the driver app keeps up to 500 points in IndexedDB and flushes them in
// batches of 20 when the network is back. Every call is wrapped: no IndexedDB means no buffer.

const DB_NAME = "apt-gps";
const STORE = "points";
export const GPS_BUFFER_MAX = 500;

interface BufferedPoint {
  id?: number;
  tripId: string;
  point: GpsPointInput;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function done(tx: IDBTransaction, db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      resolve();
    };
  });
}

/** Adds points, dropping the oldest beyond 500. */
export async function bufferPoints(tripId: string, points: GpsPointInput[]): Promise<void> {
  const db = await openDb();
  if (!db || points.length === 0) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const point of points) store.add({ tripId, point } satisfies BufferedPoint);
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      let extra = countRequest.result - GPS_BUFFER_MAX;
      if (extra <= 0) return;
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current || extra <= 0) return;
        current.delete();
        extra -= 1;
        current.continue();
      };
    };
    await done(tx, db);
  } catch {
    db.close();
  }
}

/** The oldest `limit` points of a trip, with their ids (for removal after a successful send). */
export async function peekPoints(tripId: string, limit: number): Promise<{ ids: number[]; points: GpsPointInput[] }> {
  const db = await openDb();
  if (!db) return { ids: [], points: [] };
  const out: { ids: number[]; points: GpsPointInput[] } = { ids: [], points: [] };
  try {
    const tx = db.transaction(STORE, "readonly");
    const cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current || out.points.length >= limit) return;
      const value = current.value as BufferedPoint;
      if (value.tripId === tripId) {
        out.ids.push(current.key as number);
        out.points.push(value.point);
      }
      current.continue();
    };
    await done(tx, db);
  } catch {
    db.close();
  }
  return out;
}

export async function removePoints(ids: number[]): Promise<void> {
  const db = await openDb();
  if (!db || ids.length === 0) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    for (const id of ids) tx.objectStore(STORE).delete(id);
    await done(tx, db);
  } catch {
    db.close();
  }
}

export async function bufferedCount(): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  let count = 0;
  try {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).count();
    request.onsuccess = () => {
      count = request.result;
    };
    await done(tx, db);
  } catch {
    db.close();
  }
  return count;
}
