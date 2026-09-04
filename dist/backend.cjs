Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_rolldown_runtime = require("./rolldown-runtime-VH7oDXx4.cjs");
let node_timers_promises = require("node:timers/promises");
let _koa_cors = require("@koa/cors");
_koa_cors = require_rolldown_runtime.__toESM(_koa_cors);
let _koa_router = require("@koa/router");
_koa_router = require_rolldown_runtime.__toESM(_koa_router);
let koa = require("koa");
koa = require_rolldown_runtime.__toESM(koa);
let koa_easy_ws = require("koa-easy-ws");
koa_easy_ws = require_rolldown_runtime.__toESM(koa_easy_ws);
let koa_helmet = require("koa-helmet");
koa_helmet = require_rolldown_runtime.__toESM(koa_helmet);
let koa_logger = require("koa-logger");
koa_logger = require_rolldown_runtime.__toESM(koa_logger);
let trpc_koa_adapter = require("trpc-koa-adapter");
let node_async_hooks = require("node:async_hooks");
let knex = require("knex");
knex = require_rolldown_runtime.__toESM(knex);
let pg = require("pg");
let postgres_range = require("postgres-range");
let superjson = require("superjson");
superjson = require_rolldown_runtime.__toESM(superjson);
let narrow_types = require("narrow-types");
let request_ip = require("request-ip");
let _trpc_server = require("@trpc/server");
let pg_listen = require("pg-listen");
pg_listen = require_rolldown_runtime.__toESM(pg_listen);
//#region src/backend/db.ts
globalThis.__cedarDbStorage ??= new node_async_hooks.AsyncLocalStorage();
const dbAsyncLocalStorage = globalThis.__cedarDbStorage;
let _globalDb = null;
function setupRangeTypes() {
	pg.types.setTypeParser(3908, (v) => (0, postgres_range.parse)(v, (v) => new Date(v)));
	postgres_range.Range.prototype.toPostgres = function(prepareValue) {
		return (0, postgres_range.serialize)(this, prepareValue);
	};
	superjson.default.registerCustom({
		isApplicable: (v) => v instanceof postgres_range.Range,
		serialize: (v) => (0, postgres_range.serialize)(v, (v) => v.toISOString()),
		deserialize: (v) => (0, postgres_range.parse)(v, (v) => new Date(v))
	}, "Range<Date>");
}
function initDb(config) {
	_globalDb = (0, knex.default)(config);
	setupRangeTypes();
}
const getDb = () => {
	const { db } = dbAsyncLocalStorage.getStore() || {};
	if (!db) throw new Error("Knex instance not found in AsyncLocalStorage");
	return db;
};
const getTrx = () => {
	const { trx } = dbAsyncLocalStorage.getStore() || {};
	if (!trx) throw new Error("Transaction not found in AsyncLocalStorage");
	return trx;
};
const dbMiddleware = async (_ctx, next) => {
	if (!_globalDb) throw new Error("initDb() must be called before handling requests");
	return _globalDb.transaction(async (trx) => dbAsyncLocalStorage.run({
		db: _globalDb,
		trx
	}, async () => {
		await next();
	}));
};
function wrapInTransaction(callback, db) {
	return async (...args) => {
		const target = db ?? _globalDb;
		if (!target) throw new Error("initDb() must be called before wrapping transactions");
		return target.transaction(async (trx) => dbAsyncLocalStorage.run({
			db: target,
			trx
		}, async () => await callback(...args)));
	};
}
//#endregion
//#region src/backend/create-app.ts
const defaultHelmetConfig = { contentSecurityPolicy: { directives: {
	defaultSrc: ["'self'"],
	styleSrc: ["'self'", "https://fonts.googleapis.com"],
	fontSrc: ["'self'", "https://fonts.gstatic.com"]
} } };
function createApp(options) {
	const { corsConfig = {}, appApi, createContext, wsHandler, simulateLatency } = options;
	const app = new koa.default();
	app.use((0, koa_easy_ws.default)());
	app.use((0, koa_helmet.default)(defaultHelmetConfig));
	app.use((0, _koa_cors.default)(corsConfig));
	app.use(dbMiddleware);
	app.use((0, koa_logger.default)());
	if (simulateLatency) app.use(async (_ctx, next) => {
		await next();
		await (0, node_timers_promises.setTimeout)(simulateLatency);
	});
	const router = new _koa_router.default();
	router.get("/ping", async (ctx) => ctx.body = "pong");
	if (wsHandler) router.get("/ws", wsHandler);
	app.use(router.routes());
	app.use(router.allowedMethods());
	app.use((0, trpc_koa_adapter.createKoaMiddleware)({
		router: appApi,
		prefix: "/trpc",
		createContext
	}));
	return app;
}
//#endregion
//#region src/backend/create-trpc.ts
const trpcConfig = { transformer: superjson.default };
function buildContext(config) {
	return async function createContext({ req }) {
		const r = narrow_types.ipString.safeParse((0, request_ip.getClientIp)(req));
		const clientIp = r.success ? r.data : void 0;
		let user;
		if (req.headers.authorization) user = await config.decodeSessionToken(req.headers.authorization.split(" ")[1], clientIp);
		const origin = req.headers.origin;
		let workspaceVersion;
		const versionHeader = req.headers["x-workspace-version"];
		if (typeof versionHeader === "string") {
			const parsed = new Date(versionHeader);
			if (!isNaN(parsed.getTime())) workspaceVersion = parsed;
		}
		return {
			user,
			clientIp,
			origin,
			workspaceVersion
		};
	};
}
//#endregion
//#region src/backend/trpc-assert.ts
function trpcAssert(condition, msg, code = "INTERNAL_SERVER_ERROR") {
	if (!condition) throw new _trpc_server.TRPCError({
		code,
		message: msg
	});
}
//#endregion
//#region src/backend/poke-workspace.ts
/**
* The Postgres NOTIFY channel every app instance LISTENs on for workspace
* changes. The payload is the typed anchor only — `{ type, id }` — never row
* data: NOTIFY caps at 8 kB, and a poked client pulls the delta itself anyway.
*/
const WORKSPACE_CHANGED_CHANNEL = "workspace_changed";
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
async function pokeWorkspace(anchorType, anchorId) {
	const payload = {
		type: anchorType,
		id: anchorId
	};
	await getTrx().raw("SELECT pg_notify(?, ?)", [WORKSPACE_CHANGED_CHANNEL, JSON.stringify(payload)]);
}
//#endregion
//#region src/backend/socket-registry.ts
const noopLogger$1 = {
	info: () => {},
	error: () => {}
};
/**
* The shared socket registry both apps run. Sockets are keyed by **topic**, not
* by member: `member:{id}` (chat) and `anchor:{type}:{id}` (workspace) are just
* topics, and one socket may hold several. On connect, after token auth, the
* app decides the socket's topics via `resolveSubscriptions(member)` — that is
* where "admin ⇒ user + admin workspaces" or "member ⇒ their org's workspace"
* is expressed. Because subscriptions are derived from the authenticated
* identity server-side, there is no client-asserted-topic attack surface.
*
* Membership uses `Map`/`Set` operations throughout. The registry this replaces
* tested `member.id in wsMap` — `in` checks object properties, not `Map`
* entries, so it was always false and every reconnect orphaned the member's
* other tabs. That silent bug must not recur here.
*/
function createSocketRegistry(options) {
	const { authenticate, resolveSubscriptions, logger = noopLogger$1, authTimeoutMs = 5e3 } = options;
	const byTopic = /* @__PURE__ */ new Map();
	const allSockets = /* @__PURE__ */ new Map();
	function subscribe(id, socket, topics) {
		allSockets.set(id, socket);
		for (const topic of topics) {
			let sockets = byTopic.get(topic);
			if (!sockets) {
				sockets = /* @__PURE__ */ new Map();
				byTopic.set(topic, sockets);
			}
			sockets.set(id, socket);
		}
	}
	function unsubscribe(id, topics) {
		allSockets.delete(id);
		for (const topic of topics) {
			const sockets = byTopic.get(topic);
			if (!sockets) continue;
			sockets.delete(id);
			if (sockets.size === 0) byTopic.delete(topic);
		}
	}
	function sendToTopic(topic, payloadString) {
		const sockets = byTopic.get(topic);
		if (!sockets || sockets.size === 0) return;
		for (const socket of sockets.values()) socket.send(payloadString);
	}
	function isTopicSubscribed(topic) {
		const sockets = byTopic.get(topic);
		return sockets !== void 0 && sockets.size > 0;
	}
	function broadcast(payloadString) {
		for (const socket of allSockets.values()) socket.send(payloadString);
	}
	const wsHandler = async (ctx, next) => {
		const parsedIp = narrow_types.ipString.safeParse((0, request_ip.getClientIp)(ctx.req));
		const clientIp = parsedIp.success ? parsedIp.data : void 0;
		const socket = await ctx.ws();
		const member = await new Promise((resolve) => {
			const timer = setTimeout(() => {
				socket.close(1008, "Authentication timeout");
				resolve(void 0);
			}, authTimeoutMs);
			socket.once("message", (inputBuffer) => {
				clearTimeout(timer);
				const token = inputBuffer.toString("utf8");
				authenticate(token, clientIp).then(resolve);
			});
			socket.once("close", () => {
				clearTimeout(timer);
				resolve(void 0);
			});
		});
		if (!member) {
			ctx.body = "OK";
			await next();
			return;
		}
		const id = Symbol();
		const topics = resolveSubscriptions(member);
		socket.on("error", (err) => {
			logger.error("Socket error", err);
		});
		socket.on("close", () => {
			unsubscribe(id, topics);
		});
		socket.on("message", (inputBuffer) => {
			if (inputBuffer.toString("utf8") === "ping") socket.send("pong");
		});
		subscribe(id, socket, topics);
		ctx.body = "OK";
		await next();
	};
	return {
		wsHandler,
		sendToTopic,
		isTopicSubscribed,
		broadcast
	};
}
//#endregion
//#region src/backend/db-listener.ts
const noopLogger = {
	info: () => {},
	error: () => {}
};
/** Carries a channel's NOTIFY payload (already JSON-parsed by pg-listen) to
* `EventTarget` listeners as `event.detail`. */
var PayloadEvent = class extends Event {
	detail;
	constructor(type, detail) {
		super(type);
		this.detail = detail;
	}
};
/**
* Bridges Postgres `LISTEN/NOTIFY` to an `EventTarget`, generalized from
* Beatpoints' single-`chat`-channel listener. Each instance runs one of these
* and subscribes its own sockets, which is what makes pokes cross-instance: a
* write on any instance NOTIFYs, and every instance hears it.
*
* Pokes are best-effort — a `pg-listen` reconnect drops notifications in its
* gap — so a client's fallback poll is the correctness backstop, not this.
*/
async function establishDbListener(connectionString, channels, logger = noopLogger) {
	logger.info("Setting up db listener for channels:", channels.join(", "));
	const target = new EventTarget();
	const subscriber = (0, pg_listen.default)({ connectionString });
	for (const channel of channels) subscriber.notifications.on(channel, (payload) => {
		target.dispatchEvent(new PayloadEvent(channel, payload));
	});
	subscriber.events.on("connected", () => {
		logger.info("Db listener connected");
	});
	subscriber.events.on("error", (error) => {
		logger.error("Db listener connection error:", error);
	});
	process.on("exit", () => {
		subscriber.close();
	});
	await subscriber.connect();
	for (const channel of channels) await subscriber.listenTo(channel);
	return {
		target,
		close: () => subscriber.close()
	};
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
function bridgeWorkspacePokesToSockets(options) {
	const { target, sendToTopic, debounceMs = 100 } = options;
	const pending = /* @__PURE__ */ new Map();
	const listener = (event) => {
		const payload = event.detail;
		if (payload == null || payload.type === void 0 || payload.id === void 0) return;
		const key = `${payload.type}:${payload.id}`;
		if (pending.has(key)) return;
		const timer = setTimeout(() => {
			pending.delete(key);
			sendToTopic(`anchor:${key}`, JSON.stringify({
				type: "workspace-poke",
				anchor: key
			}));
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
//#endregion
Object.defineProperty(exports, "TRPCError", {
	enumerable: true,
	get: function() {
		return _trpc_server.TRPCError;
	}
});
exports.WORKSPACE_CHANGED_CHANNEL = WORKSPACE_CHANGED_CHANNEL;
exports.bridgeWorkspacePokesToSockets = bridgeWorkspacePokesToSockets;
exports.buildContext = buildContext;
exports.createApp = createApp;
exports.createSocketRegistry = createSocketRegistry;
exports.dbMiddleware = dbMiddleware;
exports.establishDbListener = establishDbListener;
exports.getDb = getDb;
exports.getTrx = getTrx;
exports.initDb = initDb;
exports.pokeWorkspace = pokeWorkspace;
exports.trpcAssert = trpcAssert;
exports.trpcConfig = trpcConfig;
exports.wrapInTransaction = wrapInTransaction;

//# sourceMappingURL=backend.cjs.map