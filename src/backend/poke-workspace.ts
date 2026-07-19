import { getTrx } from "./db";

/**
 * The Postgres NOTIFY channel every app instance LISTENs on for workspace
 * changes. The payload is the typed anchor only — `{ type, id }` — never row
 * data: NOTIFY caps at 8 kB, and a poked client pulls the delta itself anyway.
 */
export const WORKSPACE_CHANGED_CHANNEL = "workspace_changed";

export type WorkspacePokePayload = {
  type: string;
  id: string | number;
};

/**
 * Announce that the workspace anchored on `${anchorType}:${anchorId}` changed,
 * so connected clients pull a fresh delta. This is the app-level poke: it is
 * called by the code that performs a write, not by a database trigger.
 *
 * Two things make it correct across a fleet:
 *
 * - **Transport, not source.** It emits a Postgres NOTIFY, so the write's
 *   instance and the client's instance need not be the same — every instance
 *   LISTENs and pokes its own sockets (see `establishDbListener` /
 *   `bridgeWorkspacePokesToSockets`). Single-instance collapses to the same
 *   path (the one instance hears its own notify).
 * - **Rides the transaction.** It runs on the current request/job transaction
 *   (`getTrx`), so Postgres buffers the NOTIFY until commit: clients are told to
 *   pull only once the change is durably visible, and a rolled-back write pokes
 *   no one. Call it from within the same transaction as the write.
 *
 * Coalesce to one call per unit of work (e.g. one per job, not one per row):
 * the delta pull reflects everything since the client's version regardless, and
 * the listener debounces per key on top of that.
 */
export async function pokeWorkspace(
  anchorType: string,
  anchorId: string | number,
): Promise<void> {
  const payload: WorkspacePokePayload = { type: anchorType, id: anchorId };
  await getTrx().raw("SELECT pg_notify(?, ?)", [
    WORKSPACE_CHANGED_CHANNEL,
    JSON.stringify(payload),
  ]);
}
