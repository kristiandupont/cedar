Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_chunk = require("./chunk-C2EiDwsr.cjs");
let narrow_types = require("narrow-types");
let jsonwebtoken = require("jsonwebtoken");
jsonwebtoken = require_chunk.__toESM(jsonwebtoken);
let node_crypto = require("node:crypto");
node_crypto = require_chunk.__toESM(node_crypto);
//#region src/auth/jwt.ts
function createSessionTokenHandler(options) {
	async function generateSessionToken(memberId, clientIp, tokenVersion) {
		const secret = await options.getSecret();
		return jsonwebtoken.sign({
			memberId,
			clientIp,
			tokenVersion
		}, secret, options.jwtOptions);
	}
	async function decodeAndVerifySessionToken(token, ipAddress) {
		const secret = await options.getSecret();
		let decoded;
		try {
			decoded = jsonwebtoken.verify(token, secret);
		} catch (error) {
			if (error instanceof jsonwebtoken.JsonWebTokenError) return;
			throw error;
		}
		const { memberId, clientIp, tokenVersion } = decoded;
		const user = await options.lookupUser(memberId);
		if (!user) return void 0;
		if (options.getTokenVersion && tokenVersion !== options.getTokenVersion(user)) return;
		if (options.isAdmin?.(user) && ipAddress && clientIp !== ipAddress) return;
		return user;
	}
	return {
		generateSessionToken,
		decodeAndVerifySessionToken
	};
}
//#endregion
//#region src/auth/login-token.ts
function createLoginTokenHandler(options) {
	const { getSecret } = options;
	async function createLoginToken(email) {
		const rawToken = `${node_crypto.randomBytes(3).toString("hex")}${email}${node_crypto.randomBytes(3).toString("hex")}`;
		const iv = node_crypto.randomBytes(16);
		const encryptionKeyHex = await getSecret();
		const encryptionKey = Buffer.from(encryptionKeyHex, "hex");
		const cipher = node_crypto.createCipheriv("aes-256-cbc", new Uint8Array(encryptionKey), new Uint8Array(iv));
		let encryptedToken = cipher.update(rawToken, "utf8", "hex");
		encryptedToken += cipher.final("hex");
		encryptedToken += iv.toString("hex");
		return encryptedToken;
	}
	async function extractEmailFromToken(token) {
		const iv = Buffer.from(token.slice(-32), "hex");
		const encryptedToken = token.slice(0, -32);
		const encryptionKeyHex = await getSecret();
		const encryptionKey = Buffer.from(encryptionKeyHex, "hex");
		const decipher = node_crypto.createDecipheriv("aes-256-cbc", new Uint8Array(encryptionKey), new Uint8Array(iv));
		let decryptedToken = decipher.update(encryptedToken, "hex", "utf8");
		decryptedToken += decipher.final("utf8");
		return narrow_types.emailString.parse(decryptedToken.slice(6, -6));
	}
	return {
		createLoginToken,
		extractEmailFromToken
	};
}
//#endregion
exports.createLoginTokenHandler = createLoginTokenHandler;
exports.createSessionTokenHandler = createSessionTokenHandler;

//# sourceMappingURL=auth.cjs.map