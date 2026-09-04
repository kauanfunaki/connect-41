import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import type { PasswordResetSubject } from "@/generated/prisma/enums";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1h — mesmo racional do access token curto: janela pequena o bastante pra não valer a pena atacar, longa o bastante pro usuário abrir o e-mail.

// Só o hash vai pro banco (mesmo padrão do RefreshToken) — o token cru só
// existe no e-mail enviado, nunca é persistido em texto puro.
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Token de redefinição para uma conta interna ou de portal.
 *
 * O `subject` discrimina de quem é. Uma tabela só porque expiração, uso único e
 * limpeza são idênticos nos dois casos — duas tabelas duplicariam as três
 * regras, e é onde elas passariam a divergir.
 */
export async function createPasswordResetToken(
  subjectId: string,
  subject: PasswordResetSubject = "USER"
): Promise<string> {
  const prisma = getPrisma();
  const raw = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: subjectId,
      subject,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return raw;
}

/**
 * Consome o token (marca `usedAt`) e devolve de quem ele é.
 *
 * De uso único: uma segunda tentativa com o mesmo link — ou com um link antigo
 * reenviado — falha.
 *
 * Devolve o `subject` junto, e não só o id: sem ele, quem consome teria de
 * adivinhar em qual tabela procurar, e um token de portal buscaria em `users`,
 * não acharia, e falharia por acidente em vez de por desenho.
 */
export async function consumePasswordResetToken(
  raw: string
): Promise<{ subject: PasswordResetSubject; id: string } | null> {
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
  return { subject: record.subject, id: record.userId };
}
