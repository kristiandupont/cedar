Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_rolldown_runtime = require("./rolldown-runtime-VH7oDXx4.cjs");
const require_ws_close_codes = require("./ws-close-codes-C2I_UIEG.cjs");
let superjson = require("superjson");
superjson = require_rolldown_runtime.__toESM(superjson);
let react_jsx_runtime = require("react/jsx-runtime");
let _trpc_client = require("@trpc/client");
let _trpc_react_query = require("@trpc/react-query");
let workspace_sync = require("workspace-sync");
let _tanstack_react_query = require("@tanstack/react-query");
let react_geiger = require("react-geiger");
let react = require("react");
//#region src/frontend/combine-wrappers.tsx
const wrp = (Wrapper, props = void 0) => ({
	Wrapper,
	props
});
const combineWrappers = (displayName, wrappers) => {
	const result = (({ children }) => wrappers.reduceRight((acc, { Wrapper, props }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Wrapper, {
		...props,
		children: acc
	}), children));
	result.displayName = displayName;
	return result;
};
//#endregion
//#region src/frontend/create-trpc-clients.ts
async function buildHeaders() {
	const sessionToken = localStorage.getItem("sessionToken");
	const headers = { authorization: sessionToken ? `Bearer ${sessionToken}` : "" };
	if (workspace_sync.workspaceVersionRef.current) headers["x-workspace-version"] = workspace_sync.workspaceVersionRef.current.toISOString();
	return headers;
}
function createTrpcClients(options) {
	const trpc = (0, _trpc_react_query.createTRPCReact)();
	return {
		trpc,
		trpcClient: trpc.createClient({
			transformer: superjson.default,
			links: [(0, _trpc_client.httpBatchLink)({
				url: options.url,
				headers: buildHeaders
			})]
		}),
		trpcVanillaClient: (0, _trpc_client.createTRPCProxyClient)({
			transformer: superjson.default,
			links: [(0, _trpc_client.httpBatchLink)({
				url: options.url,
				headers: buildHeaders
			})]
		})
	};
}
//#endregion
//#region src/frontend/root-providers.tsx
const defaultQueryClientOptions = { queries: {
	refetchOnMount: false,
	refetchOnReconnect: false,
	refetchOnWindowFocus: false,
	retry: false
} };
function createCoreProviders(trpc, trpcClient, geigerEnabled = false) {
	const queryClient = new _tanstack_react_query.QueryClient({ defaultOptions: defaultQueryClientOptions });
	return {
		providers: [
			wrp(trpc.Provider, {
				client: trpcClient,
				queryClient
			}),
			wrp(_tanstack_react_query.QueryClientProvider, { client: queryClient }),
			wrp(react_geiger.Geiger, { enabled: geigerEnabled })
		],
		queryClient
	};
}
//#endregion
//#region src/frontend/use-mutation-with-delta.ts
function useMutationWithDelta(mutation, applyDelta) {
	return {
		...mutation,
		data: mutation.data?.data,
		mutate: (variables, options) => {
			mutation.mutate(variables, {
				...options,
				onSuccess: (data, vars, ctx) => {
					applyDelta(data.delta);
					options?.onSuccess?.(data.data, vars, ctx);
				}
			});
		},
		mutateAsync: async (variables, options) => {
			const result = await mutation.mutateAsync(variables, options);
			applyDelta(result.delta);
			return result.data;
		}
	};
}
//#endregion
//#region src/frontend/ws-provider.tsx
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
const wsEventTarget = target;
const wsContext = (0, react.createContext)({ target });
const WsProvider = ({ children, wsUrl }) => {
	const wsRef = (0, react.useRef)(void 0);
	const sessionToken = localStorage.getItem("sessionToken");
	(0, react.useEffect)(() => {
		if (!sessionToken) throw new Error("No session token");
		let authFailed = false;
		const tryConnect = () => {
			const webSocket = new WebSocket(wsUrl);
			wsRef.current = webSocket;
			webSocket.addEventListener("open", () => {
				webSocket.send(sessionToken);
				target.dispatchEvent(new Event("open"));
			});
			webSocket.addEventListener("message", (event) => {
				target.dispatchEvent(new MessageEvent("message", { data: event.data }));
			});
			webSocket.addEventListener("close", (event) => {
				if (event.code === require_ws_close_codes.wsCloseCodes.authFailed) {
					authFailed = true;
					target.dispatchEvent(new Event("auth-failed"));
				}
			});
		};
		tryConnect();
		const interval = setInterval(() => {
			if (!authFailed && wsRef.current?.readyState === WebSocket.CLOSED) tryConnect();
		}, 1e3);
		return () => {
			clearInterval(interval);
			wsRef.current?.close();
		};
	}, [sessionToken, wsUrl]);
	const value = (0, react.useMemo)(() => ({ target }), []);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(wsContext.Provider, {
		value,
		children
	});
};
const useWs = () => (0, react.useContext)(wsContext);
//#endregion
exports.WsProvider = WsProvider;
exports.combineWrappers = combineWrappers;
exports.createCoreProviders = createCoreProviders;
exports.createTrpcClients = createTrpcClients;
exports.useMutationWithDelta = useMutationWithDelta;
exports.useWs = useWs;
exports.workspaceVersionRef = workspace_sync.workspaceVersionRef;
exports.wrp = wrp;
exports.wsEventTarget = wsEventTarget;

//# sourceMappingURL=frontend.cjs.map