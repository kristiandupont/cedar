import * as crypto from "node:crypto";

import { type EmailString, emailString } from "narrow-types";

export function createLoginTokenHandler(options: {
  getSecret: () => Promise<string>;
}) {
  const { getSecret } = options;

  async function createLoginToken(email: EmailString): Promise<string> {
    const prefix = crypto.randomBytes(3).toString("hex");
    const suffix = crypto.randomBytes(3).toString("hex");

    const rawToken = `${prefix}${email}${suffix}`;

    const iv = crypto.randomBytes(16);
    const encryptionKeyHex = await getSecret();
    const encryptionKey = Buffer.from(encryptionKeyHex, "hex");
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      new Uint8Array(encryptionKey),
      new Uint8Array(iv),
    );
    let encryptedToken = cipher.update(rawToken, "utf8", "hex");
    encryptedToken += cipher.final("hex");

    encryptedToken += iv.toString("hex");
    return encryptedToken;
  }

  async function extractEmailFromToken(token: string): Promise<EmailString> {
    const iv = Buffer.from(token.slice(-32), "hex");
    const encryptedToken = token.slice(0, -32);

    const encryptionKeyHex = await getSecret();
    const encryptionKey = Buffer.from(encryptionKeyHex, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      new Uint8Array(encryptionKey),
      new Uint8Array(iv),
    );
    let decryptedToken = decipher.update(encryptedToken, "hex", "utf8");
    decryptedToken += decipher.final("utf8");

    return emailString.parse(decryptedToken.slice(6, -6));
  }

  return { createLoginToken, extractEmailFromToken };
}
