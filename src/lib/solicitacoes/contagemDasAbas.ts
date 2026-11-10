// O balão de cada aba das Solicitações (10/11/2026, pedido do Kauan: "seguir
// a linha dos Chamados, onde as tabs têm um balão da quantidade de itens").
//
// A regra é uma só: o número é o que a lista da aba mostra ao abrir, com os
// filtros padrão da tela, para quem está olhando — o mesmo escopo e o mesmo
// `where` da lista, contados no banco (`count`, nos índices de cada tabela),
// sem carregar linha. As abas contam em paralelo e falham sozinhas: a aba fica
// sem número, e a tela não cai.
//
// Comunicados fica sem balão: é o arquivo do que já foi avisado a vários
// clientes de uma vez, e nada nele espera a equipe — o número só cresceria.

import { unstable_rethrow } from "next/navigation";
import type { AuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { getActiveSectors } from "@/lib/sectors";
import { contarEnviosDaEquipe } from "@/lib/envios/consultas";
import { contarPendencias } from "@/lib/financeiro/pendencias/consultas";
import { dosSetores, setorPadraoDasPendencias, soDoSetorPadrao } from "@/lib/financeiro/pendencias/setor";
import { contarFilaDeAprovacoes, empresaDaFilaDeAprovacoes } from "@/lib/financeiro/aprovacao/filaServidor";
import { setoresAtivosDaFila, setoresDaFila } from "./acesso";
import { contarDaEquipe } from "./consultas";

export type AbaDoAtendimento = "solicitacoes" | "pedidos" | "comunicados" | "envios" | "pendencias" | "aprovacoes";

/** A quantidade de cada aba; a que falta não ganha balão. */
export type ContagemDasAbas = Partial<Record<AbaDoAtendimento, number>>;

async function contar(aba: AbaDoAtendimento, consulta: () => Promise<number>): Promise<[AbaDoAtendimento, number] | null> {
  try {
    return [aba, await consulta()];
  } catch (err) {
    // `notFound()`, `redirect()` e afins são o Next conduzindo a resposta, não falha.
    unstable_rethrow(err);
    console.error(`[abasDoAtendimento] contagem indisponível: ${aba}`, err);
    return null;
  }
}

/**
 * As contagens das abas que a pessoa vê. `doBpo` diz quais abas do BPO
 * (Pendências, Aprovações) aparecem para ela — a que não aparece nem conta.
 */
export async function contarAsAbasDoAtendimento(ctx: AuthContext, doBpo: ReadonlySet<AbaDoAtendimento>): Promise<ContagemDasAbas> {
  const tenantId = ctx.tenantId;
  if (!tenantId) return {};
  const setores = setoresDaFila(ctx);

  const contagens = await Promise.all([
    // Situação "Em aberto": os setores da pessoa e o que está com ela.
    contar("solicitacoes", () => contarDaEquipe({ tenantId, setores, userId: ctx.userId }, "abertas")),
    // Situação "Em andamento", em todos os setores ativos que a pessoa alcança.
    contar("pedidos", async () => {
      const [ativos, padrao] = await Promise.all([getActiveSectors(tenantId), setorPadraoDasPendencias(tenantId)]);
      const codigos = setoresAtivosDaFila(ativos, setores).map((s) => s.code);
      return contarPendencias({ tenantId, companyIds: null, setores: dosSetores(codigos, padrao) }, "andamento");
    }),
    // Situação "Todas", nas empresas que a pessoa enxerga.
    contar("envios", async () => contarEnviosDaEquipe({ tenantId, empresas: await scopedCompanyWhere(ctx) })),
    // "Em andamento", só do setor do módulo (e as sem setor, de antes de 01/10).
    doBpo.has("pendencias")
      ? contar("pendencias", async () =>
          contarPendencias({ tenantId, companyIds: null, setores: soDoSetorPadrao(await setorPadraoDasPendencias(tenantId)) }, "andamento")
        )
      : null,
    // Aguardando e reprovadas, na empresa da faixa "Trabalhando em" (ou todas).
    doBpo.has("aprovacoes")
      ? contar("aprovacoes", async () => contarFilaDeAprovacoes(tenantId, (await empresaDaFilaDeAprovacoes(undefined)).empresaId))
      : null,
  ]);

  return Object.fromEntries(contagens.filter((c) => c !== null)) as ContagemDasAbas;
}
