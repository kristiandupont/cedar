import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bridgeWorkspacePokesToSockets } from "./db-listener";
import { WORKSPACE_CHANGED_CHANNEL } from "./poke-workspace";

/** Stands in for the event `establishDbListener` dispatches: a channel-named
 * event carrying the parsed NOTIFY payload on `detail`. */
function pokeEvent(detail: unknown): Event {
  const event = new Event(WORKSPACE_CHANGED_CHANNEL);
  (event as Event & { detail: unknown }).detail = detail;
  return event;
}

describe("bridgeWorkspacePokesToSockets", () => {
  let target: EventTarget;
  let sendToTopic: ReturnType<typeof vi.fn<(topic: string, payload: string) => void>>;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    target = new EventTarget();
    sendToTopic = vi.fn();
    stop = bridgeWorkspacePokesToSockets({
      target,
      sendToTopic,
      debounceMs: 100,
    });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("routes a poke to its anchor topic, naming the anchor", () => {
    target.dispatchEvent(pokeEvent({ type: "member", id: 5 }));
    vi.advanceTimersByTime(100);

    expect(sendToTopic).toHaveBeenCalledTimes(1);
    expect(sendToTopic).toHaveBeenCalledWith(
      "anchor:member:5",
      JSON.stringify({ type: "workspace-poke", anchor: "member:5" }),
    );
  });

  it("coalesces a burst on one key into a single poke", () => {
    for (let i = 0; i < 5; i++) {
      target.dispatchEvent(pokeEvent({ type: "member", id: 5 }));
    }
    vi.advanceTimersByTime(100);
    expect(sendToTopic).toHaveBeenCalledTimes(1);
  });

  it("keeps distinct anchors on distinct timers", () => {
    target.dispatchEvent(pokeEvent({ type: "member", id: 5 }));
    target.dispatchEvent(pokeEvent({ type: "org", id: 5 }));
    vi.advanceTimersByTime(100);

    expect(sendToTopic).toHaveBeenCalledTimes(2);
    expect(sendToTopic).toHaveBeenCalledWith(
      "anchor:member:5",
      expect.any(String),
    );
    expect(sendToTopic).toHaveBeenCalledWith("anchor:org:5", expect.any(String));
  });

  it("ignores malformed payloads", () => {
    target.dispatchEvent(pokeEvent(undefined));
    target.dispatchEvent(pokeEvent({ type: "member" }));
    target.dispatchEvent(pokeEvent({ id: 5 }));
    vi.advanceTimersByTime(100);
    expect(sendToTopic).not.toHaveBeenCalled();
  });

  it("stops routing after unsubscribe", () => {
    stop();
    target.dispatchEvent(pokeEvent({ type: "member", id: 5 }));
    vi.advanceTimersByTime(100);
    expect(sendToTopic).not.toHaveBeenCalled();
  });
});
