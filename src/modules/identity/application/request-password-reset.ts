/**
 * Pedido de reset de senha — nunca revela se o e-mail existe (mesmo
 * cuidado anti-enumeração de `login.ts`, "e-mail ou senha incorretos",
 * nunca "e-mail não encontrado"). Por isso devolve `void` sempre, nunca
 * um `Result` que distinguiria "achei"/"não achei" pra quem chama.
 * `sendResetEmail` é best-effort — mesmo padrão de `sendInviteEmail`.
 */

export interface RequestPasswordResetDeps {
  getUserByEmail(email: string): Promise<{ id: string } | null>;
  createPasswordResetToken(userId: string): Promise<{ rawToken: string; expiresAt: Date }>;
  sendResetEmail(email: string, rawToken: string): Promise<void>;
}

export async function requestPasswordReset(email: string, deps: RequestPasswordResetDeps): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await deps.getUserByEmail(normalizedEmail);
  if (!user) return;

  const reset = await deps.createPasswordResetToken(user.id);

  try {
    await deps.sendResetEmail(normalizedEmail, reset.rawToken);
  } catch {
    // best-effort — falha no envio não desfaz o token gerado.
  }
}
