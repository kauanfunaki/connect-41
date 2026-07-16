import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — mesmo racional do access token curto: janela pequena o bastante pra não valer a pena atacar, longa o bastante pro usuário abrir o e-mail.

// Só o hash vai pro banco (mesmo padrão do RefreshToken) — o token cru só
// existe no e-mail enviado, nunca é persistido em texto puro.
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const prisma = getPrisma();
  const raw = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return raw;
}

// Consome o token (marca usedAt) e retorna o userId — de uso único: uma
// segunda tentativa com o mesmo link (ou um link antigo reenviado) falha.
export async function consumePasswordResetToken(raw: string): Promise<string | null> {
  const prisma = getPrisma();
  const tokenHash = hashToken(raw);
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!record) return null;

  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return record.userId;
}
