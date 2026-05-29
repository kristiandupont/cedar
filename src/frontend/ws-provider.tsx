import type { FC, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";

type WsContext = {
  target: EventTarget;
};

const target = new EventTarget();
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

    const tryConnect = () => {
      const webSocket = new WebSocket(wsUrl);
      wsRef.current = webSocket;
      webSocket.addEventListener("open", () => {
        webSocket.send(sessionToken);
      });
      webSocket.addEventListener("message", (event) => {
        target.dispatchEvent(new MessageEvent("message", { data: event.data }));
      });
    };

    tryConnect();

    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.CLOSED) {
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
