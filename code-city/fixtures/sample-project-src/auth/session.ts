import { generateToken, TokenStore } from "./tokens.ts";
import { createLogger } from "../utils/logger.ts";
import type { Session, User } from "./types.ts";

const logger = createLogger("session");
const store = new TokenStore();

export class SessionManager {
  private sessions = new Map<string, Session>();

  create(user: User): Session {
    const token = generateToken(user.id);
    const session: Session = {
      token,
      userId: user.id,
      expiresAt: Date.now() + 1000 * 60 * 60,
    };
    this.sessions.set(token, session);
    logger.info(`session created for ${user.id}`);
    return session;
  }

  destroy(token: string): void {
    store.revoke(token);
    this.sessions.delete(token);
  }

  isValid(token: string): boolean {
    if (store.isRevoked(token)) {
      return false;
    }
    const session = this.sessions.get(token);
    return !!session && session.expiresAt > Date.now();
  }
}

export function newSessionManager(): SessionManager {
  return new SessionManager();
}
