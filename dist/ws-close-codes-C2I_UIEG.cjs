//#region src/ws-close-codes.ts
/**
* WebSocket close codes the socket registry (backend) sends and `WsProvider`
* (frontend) acts on. Imported by both bundles.
*/
const wsCloseCodes = {
	/** No auth message arrived in time. Worth retrying: the client may have
	* been slow, and its token may still be valid. */
	authTimeout: 1008,
	/** `authenticate` threw (e.g. the database was unreachable). Worth retrying. */
	serverError: 1011,
	/** The token was rejected. Retrying with the same token cannot succeed, so
	* the client stops reconnecting. 4000–4999 is the application range. */
	authFailed: 4001
};
//#endregion
Object.defineProperty(exports, "wsCloseCodes", {
	enumerable: true,
	get: function() {
		return wsCloseCodes;
	}
});

//# sourceMappingURL=ws-close-codes-C2I_UIEG.cjs.map