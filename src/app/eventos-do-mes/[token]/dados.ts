// O que a página pública dos eventos do mês e o envio dela leem (12/11/2026).

import { getPrisma } from "@/lib/prisma";
import { ehPapel, type PapelDaRubrica } from "@/lib/dp2/rubricas";

/** As rubricas que o cliente preenche: as variáveis do dia a dia e os proventos livres. */
const PAPEIS_DO_CLIENTE: PapelDaRubrica[] = ["HE50", "HE100", "NOTURNO", "FALTA", "ATRASO", "ADIANTAMENTO"];

export async function rubricasDoLink(tenantId: string) {
  const todas = await getPrisma().dp2Rubrica.findMany({ where: { tenantId, ativa: true }, orderBy: { codigo: "asc" } });
  return todas.filter((r) => (r.papel ? ehPapel(r.papel) && PAPEIS_DO_CLIENTE.includes(r.papel) : r.tipo === "PROVENTO"));
}

export async function pedidoValido(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ok: false, motivo: "Link inválido.", tipo: "invalido" } as const;
  const p = await getPrisma().dp2PedidoDeEventos.findUnique({
    where: { token },
    include: {
      competencia: {
        select: { id: true, ano: true, mes: true, tipo: true, situacao: true, companyId: true, company: { select: { name: true, displayName: true } } },
      },
    },
  });
  if (!p) return { ok: false, motivo: "Este link não existe ou foi digitado errado.", tipo: "invalido" } as const;
  if (p.situacao === "CANCELADO") return { ok: false, motivo: "Este link foi substituído por outro. Peça o novo ao escritório.", tipo: "cancelado" } as const;
  if (p.expiraEm < new Date()) return { ok: false, motivo: "Este link venceu. Peça um novo ao escritório.", tipo: "vencido" } as const;
  if (p.competencia.situacao === "FECHADA") return { ok: false, motivo: "A folha deste mês já foi fechada pelo escritório.", tipo: "fechada" } as const;
  return { ok: true, p } as const;
}
