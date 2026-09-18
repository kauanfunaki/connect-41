// A leitura da conversa livre com o cliente. As regras moram ao lado
// (`regras.ts`); aqui só a busca.
//
// O escopo é o primeiro argumento, como em `financeiro/consultas.ts` e nas
// pendências: a equipe vê o tenant, o cliente vê as empresas do grupo dele, e
// `companyIds: []` casa com nada — cliente sem empresa não herda o tenant por
// uma lista vazia.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import { ordenarConversas, resumirConversa, type MensagemDaConversa, type ResumoDaConversa } from "./regras";

export type EscopoDaConversa = { tenantId: string; companyIds: string[] | null };

function whereDoEscopo(e: EscopoDaConversa): Prisma.CompanyMessageWhereInput {
  return e.companyIds === null ? { tenantId: e.tenantId } : { tenantId: e.tenantId, companyId: { in: e.companyIds } };
}

const SELECAO = {
  id: true,
  body: true,
  createdAt: true,
  companyId: true,
  authorUser: { select: { name: true } },
  authorPortal: { select: { name: true } },
  attachments: { select: { id: true, fileName: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.CompanyMessageSelect;

type LinhaCrua = Prisma.CompanyMessageGetPayload<{ select: typeof SELECAO }>;

function paraMensagem(m: LinhaCrua): MensagemDaConversa {
  return {
    id: m.id,
    // Do cliente só quando o autor do portal existe; autor removido (SetNull)
    // cai como equipe, que é o lado que não expõe nome de outro cliente.
    lado: m.authorPortal ? "CLIENTE" : "EQUIPE",
    autorNome: m.authorPortal?.name ?? m.authorUser?.name ?? "Equipe",
    corpo: m.body,
    criadaEm: m.createdAt,
    anexos: m.attachments,
  };
}

/** Teto de mensagens carregadas de uma vez. Conversa mais longa que isso mostra o fim. */
const LIMITE_DA_CONVERSA = 300;

/** A conversa de uma empresa, da mais antiga para a mais recente. */
export async function conversaDaEmpresa(
  escopo: EscopoDaConversa,
  companyId: string
): Promise<{ mensagens: MensagemDaConversa[]; limitada: boolean }> {
  const where = { ...whereDoEscopo(escopo), companyId };
  const [total, linhas] = await Promise.all([
    getPrisma().companyMessage.count({ where }),
    getPrisma().companyMessage.findMany({
      where,
      select: SELECAO,
      orderBy: { createdAt: "desc" },
      take: LIMITE_DA_CONVERSA,
    }),
  ]);
  return { mensagens: linhas.reverse().map(paraMensagem), limitada: total > LIMITE_DA_CONVERSA };
}

export type EmpresaComConversa = {
  empresaId: string;
  empresaNome: string;
  resumo: ResumoDaConversa;
};

/**
 * As empresas que já têm conversa, na ordem em que o setor precisa olhar: quem
 * espera o escritório primeiro (ver `ordenarConversas`).
 *
 * Carrega as mensagens de todas as empresas do escopo numa consulta e resume em
 * memória: é conversa de escritório com cliente, não caixa de e-mail — a ordem
 * de grandeza é dezenas por empresa, não milhares.
 */
export async function empresasComConversa(escopo: EscopoDaConversa): Promise<EmpresaComConversa[]> {
  const linhas = await getPrisma().companyMessage.findMany({
    where: whereDoEscopo(escopo),
    select: { ...SELECAO, company: { select: { id: true, name: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
    take: 5_000,
  });

  const porEmpresa = new Map<string, { nome: string; mensagens: MensagemDaConversa[] }>();
  for (const l of linhas) {
    const atual = porEmpresa.get(l.companyId) ?? { nome: nomeExibicao(l.company), mensagens: [] };
    atual.mensagens.push(paraMensagem(l));
    porEmpresa.set(l.companyId, atual);
  }

  return ordenarConversas(
    [...porEmpresa.entries()].map(([empresaId, { nome, mensagens }]) => ({
      empresaId,
      empresaNome: nome,
      resumo: resumirConversa(mensagens),
    }))
  );
}

/** Quantas conversas esperam o escritório — o número que a home do setor mostra. */
export async function conversasEsperandoEscritorio(escopo: EscopoDaConversa): Promise<number> {
  return (await empresasComConversa(escopo)).filter((e) => e.resumo.esperandoEscritorio).length;
}
