import { EventEmitter } from "node:events";

import type * as Koa from "koa";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSocketRegistry } from "./socket-registry";

type Member = { id: number };

/** Minimal stand-in for a `ws` socket: an EventEmitter plus `send`/`close`. */
class FakeSocket extends EventEmitter {
  send = vi.fn<(data: string) => void>();
  close = vi.fn<(code?: number, reason?: string) => void>();
}

function makeCtx(socket: FakeSocket) {
  let body: unknown;
  return {
    req: { headers: {}, socket: {}, connection: {} },
    get body() {
      return body;
    },
    set body(value: unknown) {
      body = value;
    },
    ws: () => Promise.resolve(socket),
  } as unknown as Koa.Context;
}

/**
 * Runs the handler and completes token auth by emitting the first message,
 * returning the socket once it is registered (or rejected).
 */
async function connect(
  registry: ReturnType<typeof createSocketRegistry<Member>>,
  token: string,
): Promise<FakeSocket> {
  const socket = new FakeSocket();
  const next = vi.fn(() => Promise.resolve());
  const pending = registry.wsHandler(makeCtx(socket), next);
  // `ctx.ws()` resolves on a microtask, so let the handler run far enough to
  // register its message listener before we deliver the token.
  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.emit("message", Buffer.from(token, "utf8"));
  await pending;
  return socket;
}

describe("createSocketRegistry", () => {
  const authenticate = vi.fn(async (token: string) =>
    token === "reject" ? undefined : { id: Number(token) },
  );
  const resolveSubscriptions = (member: Member) => [
    `member:${member.id}`,
    `anchor:member:${member.id}`,
  ];

  let registry: ReturnType<typeof createSocketRegistry<Member>>;

  beforeEach(() => {
    vi.useRealTimers();
    authenticate.mockClear();
    registry = createSocketRegistry<Member>({
      authenticate,
      resolveSubscriptions,
    });
  });

  it("subscribes an authenticated socket to its resolved topics", async () => {
    const socket = await connect(registry, "1");

    registry.sendToTopic("member:1", "hello");
    registry.sendToTopic("anchor:member:1", "poke");

    expect(socket.send).toHaveBeenCalledWith("hello");
    expect(socket.send).toHaveBeenCalledWith("poke");
    expect(registry.isTopicSubscribed("member:1")).toBe(true);
  });

  // The registry this replaces used `member.id in wsMap`, which is always false
  // on a Map, so a second connection replaced the first and orphaned it. Here a
  // second socket on the same topic must join, not evict.
  it("keeps every socket on a shared topic (no orphaning on reconnect)", async () => {
    const first = await connect(registry, "1");
    const second = await connect(registry, "1");

    registry.sendToTopic("member:1", "to-both");

    expect(first.send).toHaveBeenCalledWith("to-both");
    expect(second.send).toHaveBeenCalledWith("to-both");
  });

  it("drops a socket from all its topics on close", async () => {
    const first = await connect(registry, "1");
    const second = await connect(registry, "1");

    first.emit("close");
    registry.sendToTopic("member:1", "after-close");

    expect(first.send).not.toHaveBeenCalledWith("after-close");
    expect(second.send).toHaveBeenCalledWith("after-close");

    second.emit("close");
    expect(registry.isTopicSubscribed("member:1")).toBe(false);
    expect(registry.isTopicSubscribed("anchor:member:1")).toBe(false);
  });

  it("sends a broadcast to each socket once, across all its topics", async () => {
    const socket = await connect(registry, "1"); // two topics
    registry.broadcast("everyone");
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalledWith("everyone");
  });

  it("answers ping with pong", async () => {
    const socket = await connect(registry, "1");
    socket.emit("message", Buffer.from("ping", "utf8"));
    expect(socket.send).toHaveBeenCalledWith("pong");
  });

  it("does not subscribe a rejected socket", async () => {
    await connect(registry, "reject");
    expect(registry.isTopicSubscribed("member:reject")).toBe(false);
    // sendToTopic to an empty topic is a silent no-op, not an error.
    expect(() => registry.sendToTopic("member:1", "x")).not.toThrow();
  });

  it("closes a socket that never authenticates", async () => {
    vi.useFakeTimers();
    const registryWithTimeout = createSocketRegistry<Member>({
      authenticate,
      resolveSubscriptions,
      authTimeoutMs: 1000,
    });
    const socket = new FakeSocket();
    const pending = registryWithTimeout.wsHandler(
      makeCtx(socket),
      vi.fn(() => Promise.resolve()),
    );
    // Async variant flushes the `ctx.ws()` microtask before firing the timer.
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(socket.close).toHaveBeenCalledWith(1008, "Authentication timeout");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
