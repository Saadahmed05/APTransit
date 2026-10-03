#!/usr/bin/env node
/**
 * Tiny Redis protocol server for local API work when Upstash is not configured.
 * Enough for health, rate limits, seat holds and search hold counters. Not BullMQ.
 * Bind: REDIS_LISTEN (default 127.0.0.1:6380)
 */
import { createServer } from "node:net";

const listen = process.env.REDIS_LISTEN ?? "127.0.0.1:6380";
const [host, portText] = listen.split(":");
const port = Number.parseInt(portText ?? "6380", 10);

/** @type {Map<string, { value: string, expireAt: number | null }>} */
const store = new Map();

function now() {
  return Date.now();
}

function getEntry(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expireAt !== null && entry.expireAt <= now()) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

function encode(value) {
  if (value === null) return "$-1\r\n";
  if (typeof value === "number") return `:${value}\r\n`;
  if (Array.isArray(value)) {
    let out = `*${value.length}\r\n`;
    for (const item of value) out += encode(item);
    return out;
  }
  const text = String(value);
  return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
}

function simple(text) {
  return `+${text}\r\n`;
}

function err(text) {
  return `-ERR ${text}\r\n`;
}

function pttl(key) {
  const entry = getEntry(key);
  if (!entry) return -2;
  if (entry.expireAt === null) return -1;
  return Math.max(0, entry.expireAt - now());
}

function expireMs(key, ms) {
  const entry = getEntry(key);
  if (!entry) return 0;
  entry.expireAt = now() + ms;
  return 1;
}

function runEval(script, keys, argv) {
  const compact = script.replace(/\s+/g, " ");
  if (compact.includes('redis.call("INCR"') && compact.includes("PTTL") && compact.includes("PEXPIRE")) {
    const key = keys[0];
    const windowMs = Number.parseInt(argv[0] ?? "0", 10);
    const existing = getEntry(key);
    const hits = (existing ? Number.parseInt(existing.value, 10) : 0) + 1;
    store.set(key, { value: String(hits), expireAt: existing?.expireAt ?? null });
    let ttl = pttl(key);
    if (ttl < 0) {
      expireMs(key, windowMs);
      ttl = windowMs;
    }
    return [hits, ttl];
  }
  throw new Error("unsupported lua script");
}

function dispatch(parts) {
  const cmd = String(parts[0] ?? "").toUpperCase();
  const args = parts.slice(1);
  switch (cmd) {
    case "PING":
      return args[0] === undefined ? simple("PONG") : encode(args[0]);
    case "ECHO":
      return encode(args[0] ?? "");
    case "AUTH":
    case "SELECT":
    case "QUIT":
    case "CLIENT":
    case "HELLO":
    case "COMMAND":
      return simple("OK");
    case "INFO":
      return encode("# Server\r\nredis_version:7.0.0\r\n");
    case "GET": {
      const entry = getEntry(args[0]);
      return encode(entry ? entry.value : null);
    }
    case "MGET": {
      return encode(args.map((key) => getEntry(key)?.value ?? null));
    }
    case "DEL": {
      let count = 0;
      for (const key of args) {
        if (getEntry(key) || store.has(key)) {
          store.delete(key);
          count += 1;
        } else {
          store.delete(key);
        }
      }
      return encode(count);
    }
    case "INCRBY":
    case "DECRBY": {
      const key = args[0];
      const delta = Number.parseInt(args[1] ?? "1", 10) * (cmd === "DECRBY" ? -1 : 1);
      const entry = getEntry(key);
      const next = (entry ? Number.parseInt(entry.value, 10) : 0) + delta;
      store.set(key, { value: String(next), expireAt: entry?.expireAt ?? null });
      return encode(next);
    }
    case "EXPIRE": {
      return encode(expireMs(args[0], Number.parseInt(args[1] ?? "0", 10) * 1000));
    }
    case "PEXPIRE": {
      return encode(expireMs(args[0], Number.parseInt(args[1] ?? "0", 10)));
    }
    case "PTTL":
      return encode(pttl(args[0]));
    case "TTL": {
      const ms = pttl(args[0]);
      if (ms < 0) return encode(ms);
      return encode(Math.ceil(ms / 1000));
    }
    case "SET": {
      const key = args[0];
      const value = args[1];
      let nx = false;
      let xx = false;
      let keepTtl = false;
      let expireAt = null;
      for (let i = 2; i < args.length; i += 1) {
        const flag = String(args[i]).toUpperCase();
        if (flag === "NX") nx = true;
        else if (flag === "XX") xx = true;
        else if (flag === "KEEPTTL") keepTtl = true;
        else if (flag === "EX") {
          i += 1;
          expireAt = now() + Number.parseInt(args[i] ?? "0", 10) * 1000;
        } else if (flag === "PX") {
          i += 1;
          expireAt = now() + Number.parseInt(args[i] ?? "0", 10);
        }
      }
      const existing = getEntry(key);
      if (nx && existing) return encode(null);
      if (xx && !existing) return encode(null);
      const ttl = keepTtl ? (existing?.expireAt ?? null) : expireAt;
      store.set(key, { value, expireAt: ttl });
      return simple("OK");
    }
    case "EVAL": {
      const script = args[0];
      const keyCount = Number.parseInt(args[1] ?? "0", 10);
      const keys = args.slice(2, 2 + keyCount);
      const argv = args.slice(2 + keyCount);
      try {
        return encode(runEval(script, keys, argv));
      } catch (error) {
        return err(error instanceof Error ? error.message : "eval failed");
      }
    }
    default:
      return err(`unknown command '${cmd}'`);
  }
}

function parseBuffer(buffer) {
  const commands = [];
  let offset = 0;
  const text = buffer.toString("utf8");

  function readLine() {
    const at = text.indexOf("\r\n", offset);
    if (at === -1) return null;
    const line = text.slice(offset, at);
    offset = at + 2;
    return line;
  }

  while (offset < text.length) {
    const start = offset;
    const first = readLine();
    if (first === null) {
      return { commands, rest: buffer.subarray(start) };
    }
    if (!first.startsWith("*")) {
      return { commands, rest: Buffer.alloc(0) };
    }
    const count = Number.parseInt(first.slice(1), 10);
    const parts = [];
    let ok = true;
    for (let i = 0; i < count; i += 1) {
      const header = readLine();
      if (header === null || !header.startsWith("$")) {
        ok = false;
        offset = start;
        break;
      }
      const size = Number.parseInt(header.slice(1), 10);
      const end = offset + size;
      if (text.length < end + 2) {
        ok = false;
        offset = start;
        break;
      }
      parts.push(text.slice(offset, end));
      offset = end + 2;
    }
    if (!ok) {
      return { commands, rest: buffer.subarray(start) };
    }
    commands.push(parts);
  }
  return { commands, rest: Buffer.alloc(0) };
}

const server = createServer((socket) => {
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const parsed = parseBuffer(pending);
    pending = parsed.rest;
    for (const parts of parsed.commands) {
      socket.write(dispatch(parts));
    }
  });
});

server.listen(port, host, () => {
  process.stdout.write(`dev redis listening on redis://${host}:${port}\n`);
});
