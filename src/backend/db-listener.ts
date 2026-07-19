import createSubscriber from "pg-listen";

import {
  WORKSPACE_CHANGED_CHANNEL,
  type WorkspacePokePayload,
} from "./poke-workspace";

type Logger = {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const noopLogger: Logger = { info: () => {}, error: () => {} };

/** Carries a channel's NOTIFY payload (already JSON-parsed by pg-listen) to
 * `EventTarget` listeners as `event.detail`. */
class PayloadEvent extends Event {
  readonly detail: unknown;
  constructor(type: string, detail: unknown) {
    super(type);
    this.detail = detail;
  }
}

export interface DbListener {
  /** Dispatches one event per channel, named for the channel, with the parsed
   * NOTIFY payload on `event.detail`. */
  target: EventTarget;
  close: () => Promise<void>;
}

/**
 * Bridges Postgres `LISTEN/NOTIFY` to an `EventTarget`, generalized from
 * Beatpoints' single-`chat`-channel listener. Each instance runs one of these
 * and subscribes its own sockets, which is what makes pokes cross-instance: a
 * write on any instance NOTIFYs, and every instance hears it.
 *
 * Pokes are best-effort — a `pg-listen` reconnect drops notifications in its
 * gap — so a client's fallback poll is the correctness backstop, not this.
 */
export async function establishDbListener(
  connectionString: string,
  channels: string[],
  logger: Logger = noopLogger,
): Promise<DbListener> {
  logger.info("Setting up db listener for channels:", channels.join(", "));
  const target = new EventTarget();
  const subscriber = createSubscriber({ connectionString });

  for (const channel of channels) {
    subscriber.notifications.on(channel, (payload) => {
      target.dispatchEvent(new PayloadEvent(channel, payload));
    });
  }

  subscriber.events.on("connected", () => {
    logger.info("Db listener connected");
  });
  subscriber.events.on("error", (error) => {
    logger.error("Db listener connection error:", error);
  });

  process.on("exit", () => {
    void subscriber.close();
  });

  await subscriber.connect();
  for (const channel of channels) await subscriber.listenTo(channel);

  return { target, close: () => subscriber.close() };
}

/**
 * Wires the `workspace_changed` channel to the socket registry: on a poke, fan
 * out to whichever sockets subscribe to that anchor's topic. The message
 * **names its anchor** (`anchor: "{type}:{id}"`) so a socket holding several
 * workspaces pulls only the one that changed.
 *
 * Debounced per anchor key: a burst of writes to one workspace (a bulk job)
 * yields a single poke, since the client pulls the whole delta since its version
 * regardless of how many writes triggered it. Returns an unsubscribe function.
 */
export function bridgeWorkspacePokesToSockets(options: {
  target: EventTarget;
  sendToTopic: (topic: string, payloadString: string) => void;
  debounceMs?: number;
}): () => void {
  const { target, sendToTopic, debounceMs = 100 } = options;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const listener = (event: Event): void => {
    const payload = (event as PayloadEvent).detail as
      | WorkspacePokePayload
      | undefined;
    if (
      payload == null ||
      payload.type === undefined ||
      payload.id === undefined
    ) {
      return;
    }

    const key = `${payload.type}:${payload.id}`;
    // A send for this key is already scheduled; this write folds into it.
    if (pending.has(key)) return;

    const timer = setTimeout(() => {
      pending.delete(key);
      sendToTopic(
        `anchor:${key}`,
        JSON.stringify({ type: "workspace-poke", anchor: key }),
      );
    }, debounceMs);
    pending.set(key, timer);
  };

  target.addEventListener(WORKSPACE_CHANGED_CHANNEL, listener);

  return () => {
    target.removeEventListener(WORKSPACE_CHANGED_CHANNEL, listener);
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
  };
}
