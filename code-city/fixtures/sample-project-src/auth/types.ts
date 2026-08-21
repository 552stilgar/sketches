export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}
