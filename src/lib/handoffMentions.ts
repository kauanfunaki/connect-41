// Extrai menções "@Nome Completo" de um texto puro (message/description da
// transferência) e resolve pra usuários reais do tenant — usado por
// criarHandoff pra notificar quem foi referenciado no texto (ver
// MentionTextarea, que insere o nome exatamente como cadastrado, pra essa
// checagem por substring funcionar). Server-only (usa Prisma) — nunca
// importar isto de um componente client.
import { getPrisma } from "@/lib/prisma";

// Ordena os nomes do maior pro menor antes de procurar, pra "@Ana" não bater
// primeiro quando o texto na verdade diz "@Ana Paula Silva" (evita "roubar" a
// menção de um nome mais específico que começa igual).
export async function findMentionedUserIds(tenantId: string, texts: (string | null | undefined)[]): Promise<string[]> {
  const combined = texts.filter(Boolean).join("\n");
  if (!combined.includes("@")) return [];

  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { tenantId, active: true },
    select: { id: true, name: true },
  });

  const sorted = [...users].sort((a, b) => b.name.length - a.name.length);
  const mentioned = new Set<string>();
  let remaining = combined;

  for (const user of sorted) {
    const token = `@${user.name}`;
    if (remaining.includes(token)) {
      mentioned.add(user.id);
      // Some com os caracteres já "consumidos" pra não deixar um nome curto
      // (ex: "Ana") casar de novo dentro do que já foi atribuído a "Ana Paula".
      remaining = remaining.split(token).join(" ".repeat(token.length));
    }
  }

  return [...mentioned];
}
