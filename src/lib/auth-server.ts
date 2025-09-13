import "server-only"; // This ensures the file only runs on server
import { EncryptJWT, jwtDecrypt } from "jose";

const CORRECT_PASSWORD = process.env.GOALS_PASSWORD ?? "goals2025";
const JWT_SECRET = process.env.JWT_SECRET ?? "gH7$kL9@mN2#pQ5&rT8*vW1!xY4%zA3^";

const TOKEN_EXPIRY = "14d";

// Ensure secret is exactly 32 bytes for AES-256-GCM
const secretKey = JWT_SECRET.padEnd(32, '0').slice(0, 32);
const secret = new TextEncoder().encode(secretKey);

/**
 * Creates an encrypted JWT token for authentication
 */
export async function createAuthToken(): Promise<string> {
  const jwt = await new EncryptJWT({ authenticated: true })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .encrypt(secret);
  
  return jwt;
}

/**
 * Verifies and decrypts a JWT token
 */
export async function verifyAuthToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtDecrypt(token, secret);
    
    if (payload.authenticated === true) {
      const now = Math.floor(Date.now() / 1000);
      const exp = payload.exp!;
      return exp > now;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Validates password
 */
export function validatePassword(password: string): boolean {
  return password === CORRECT_PASSWORD;
}