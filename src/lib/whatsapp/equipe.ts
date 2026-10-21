// Quem pode receber uma conversa do WhatsApp (02/10/2026): quem opera o setor
// do módulo, e a administração do escritório. Leitura (Diretoria) não recebe,
// e o suporte da 41 Tech (SUPER_ADMIN) só se estiver no setor: entra em todo
// tenant, mas não atende candidato.

import { getPrisma } from "@/lib/prisma";

export type PessoaDoAtendimento = { id: string; nome: string };

// `setor` aceita os setores da tela (21/10/2026): quem é de qualquer um deles.
export async function pessoasDoAtendimento(tenantId: string, setor: string | readonly string[]): Promise<PessoaDoAtendimento[]> {
  const pessoas = await getPrisma().user.findMany({
    where: {
      tenantId,
      active: true,
      OR: [{ role: "ADMIN" }, { role: { not: "READONLY" }, sectors: { some: { sectorCode: typeof setor === "string" ? setor : { in: [...setor] } } } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return pessoas.map((p) => ({ id: p.id, nome: p.name }));
}
