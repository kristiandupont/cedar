import type { FC, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";

import { wsCloseCodes } from "../ws-close-codes";

type WsContext = {
  target: EventTarget;
};

const target = new EventTarget();

/**
 * The same `EventTarget` `useWs()` exposes, available at module scope so it can
 * be handed to `createWorkspaceProvider({ pokeTarget })` (which runs outside the
 * React tree). It emits the websocket's `message` events, an `open` event on
 * every (re)connect so consumers can catch up on changes missed while the
 * socket was down, and an `auth-failed` event when the server rejects the
 * session token. After `auth-failed` the provider stops reconnecting, because
 * the same token cannot succeed; the app should re-check the session (and log
 * out) when it receives that event.
 */
export const wsEventTarget = target;

const wsContext = createContext<WsContext>({ target });

export const WsProvider: FC<{ children: ReactNode; wsUrl: string }> = ({
  children,
  wsUrl,
}) => {
  const wsRef = useRef<WebSocket | undefined>(undefined);
  const sessionToken = localStorage.getItem("sessionToken");

  useEffect(() => {
    if (!sessionToken) {
      throw new Error("No session token");
    }

    let authFailed = false;

    const tryConnect = () => {
      const webSocket = new WebSocket(wsUrl);
      wsRef.current = webSocket;
      webSocket.addEventListener("open", () => {
        webSocket.send(sessionToken);
        // Signal (re)connect so workspace providers pull a catch-up delta — a
        // socket that was down may have missed pokes.
        target.dispatchEvent(new Event("open"));
      });
      webSocket.addEventListener("message", (event) => {
        target.dispatchEvent(new MessageEvent("message", { data: event.data }));
      });
      webSocket.addEventListener("close", (event) => {
        if (event.code === wsCloseCodes.authFailed) {
          authFailed = true;
          target.dispatchEvent(new Event("auth-failed"));
        }
      });
    };

    tryConnect();

    const interval = setInterval(() => {
      if (!authFailed && wsRef.current?.readyState === WebSocket.CLOSED) {
        tryConnect();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      wsRef.current?.close();
    };
  }, [sessionToken, wsUrl]);

  const value = useMemo(() => ({ target }), []);
  return <wsContext.Provider value={value}>{children}</wsContext.Provider>;
};

export const useWs = (): WsContext => useContext(wsContext);
