import { newSessionManager } from "./session.ts";
import type { Credentials, Session, User } from "./types.ts";
import { isEmail, isNonEmpty, ValidationError } from "../utils/validate.ts";

const sessionManager = newSessionManager();

const fakeUsers: User[] = [
  { id: "u1", email: "a@example.com", displayName: "A", createdAt: "2024-01-01" },
];

export function login(credentials: Credentials): Session {
  if (!isEmail(credentials.email)) {
    throw new ValidationError("email", "invalid email");
  }
  if (!isNonEmpty(credentials.password)) {
    throw new ValidationError("password", "password required");
  }
  const user = fakeUsers.find((u) => u.email === credentials.email);
  if (!user) {
    throw new ValidationError("email", "no such user");
  }
  return sessionManager.create(user);
}

export function logout(token: string): void {
  sessionManager.destroy(token);
}
