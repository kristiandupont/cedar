# cedar/src/auth

**Purpose**: Authentication token handlers — session tokens (JWT) and passwordless login tokens (AES-encrypted).

**Key Files**:

- `jwt.ts`: `createSessionTokenHandler` — generates and verifies JWT session tokens. Optionally enforces IP pinning for admin users.
- `login-token.ts`: `createLoginTokenHandler` — AES-256-CBC encrypts/decrypts email-based one-time login tokens. Random 6-byte prefix and suffix are added before encryption to prevent email guessing from the ciphertext.

**Relationships**: No dependencies on other Cedar namespaces.
