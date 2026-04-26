import "server-only"; // This ensures the file only runs on server
import { EncryptJWT, jwtDecrypt } from "jose";
import bcrypt from "bcryptjs";

// AES-256-GCM needs exactly 32 bytes of key material. We refuse to start
// without a real secret of at least that length — the previous fallback
// string was checked into source and would let anyone forge tokens.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET environment variable must be set and at least 32 characters long. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"",
  );
}

const TOKEN_EXPIRY = "14d";

const secret = new TextEncoder().encode(JWT_SECRET.slice(0, 32));

/**
 * Creates an encrypted JWT token for authentication
 */
export async function createAuthToken(userId?: string, userName?: string): Promise<string> {
  const payload: { authenticated: true; userId?: string; userName?: string } = { authenticated: true };

  if (userId && userName) {
    payload.userId = userId;
    payload.userName = userName;
  }

  const jwt = await new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .encrypt(secret);

  return jwt;
}

/**
 * Verifies and decrypts a JWT token
 */
export async function verifyAuthToken(
  token: string,
): Promise<{ isValid: boolean; userId?: string; userName?: string }> {
  try {
    const { payload } = await jwtDecrypt(token, secret);

    if (payload.authenticated === true) {
      const now = Math.floor(Date.now() / 1000);
      const exp = payload.exp!;
      const isValid = exp > now;

      return {
        isValid,
        userId: payload.userId as string,
        userName: payload.userName as string,
      };
    }

    return { isValid: false };
  } catch {
    return { isValid: false };
  }
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

/**
 * Validate password against hash
 */
export async function validatePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
