import { hashSessionToken } from "../domain/session";

export interface LogoutDeps {
  deleteSession(sessionTokenHash: string): Promise<void>;
}

export async function logout(sessionToken: string, deps: LogoutDeps): Promise<void> {
  await deps.deleteSession(hashSessionToken(sessionToken));
}
