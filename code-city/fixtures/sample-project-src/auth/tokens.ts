import { createLogger } from "../utils/logger.ts";

const logger = createLogger("tokens");

export function generateToken(userId: string): string {
  const raw = `${userId}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  logger.debug(`generated token for ${userId}`);
  return Buffer.from(raw).toString("base64url");
}

export function decodeToken(token: string): { userId: string; issuedAt: number } {
  const raw = Buffer.from(token, "base64url").toString("utf-8");
  const [userId, issuedAt] = raw.split(".");
  return { userId, issuedAt: Number(issuedAt) };
}

export class TokenStore {
  private revoked = new Set<string>();

  revoke(token: string): void {
    this.revoked.add(token);
    logger.info(`token revoked`);
  }

  isRevoked(token: string): boolean {
    return this.revoked.has(token);
  }
}
