"use server";

import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";
import { alterarContasEmLote } from "@/lib/financeiro/edicaoEmLoteServidor";
import { moverCategoria } from "./actions";

const MAXIMO_DE_LANCAMENTOS = 50;

/**
 * O "Sim, aplicar" das propostas da Ceci do BPO (30/10/2026) chama a action da
 * tela, e não grava direto: `moverCategoria` é o "Mover" da DRE, e
 * `alterarContasEmLote` é o "Alterar marcadas" de contas. Cada uma refaz por
 * conta própria a permissão, o foco, a trava do Omie e do rateio e a
 * auditoria — se esta função gravasse, a fronteira seria só um diálogo.
 */
export async function aplicarPropostaDoBpo(proposta: PropostaDeEscrita): Promise<{ error: string } | null> {
  const a = proposta.argumentos ?? {};
  const texto = (k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");

  if (proposta.ferramenta === "propor_mover_categoria_na_dre") {
    const lado = texto("lado");
    if (lado !== "pagamento" && lado !== "recebimento") return { error: "Proposta sem o lado (pagamento ou recebimento)." };
    if (!texto("empresaId") || !texto("categoria") || !texto("linha")) return { error: "Proposta incompleta." };
    const r = await moverCategoria(texto("empresaId"), texto("categoria"), lado, texto("linha"));
    return r && "error" in r ? r : null;
  }

  if (proposta.ferramenta === "propor_recategorizar_lancamentos") {
    const ids = Array.isArray(a.lancamentoIds) ? a.lancamentoIds.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
    if (ids.length === 0) return { error: "Proposta sem lançamentos." };
    if (ids.length > MAXIMO_DE_LANCAMENTOS) return { error: `São ${ids.length} lançamentos; aplique até ${MAXIMO_DE_LANCAMENTOS} por vez pela tela de contas.` };
    if (!texto("categoriaId")) return { error: "Proposta sem a categoria de destino." };
    const form = new FormData();
    form.append("campos", "categoria");
    form.append("categoryId", texto("categoriaId"));
    for (const id of ids) form.append("entryIds", id);
    const r = await alterarContasEmLote(form);
    if ("error" in r) return r;
    // Nada mudou e alguma travou: diz por quê, em vez de marcar como aplicada.
    if (r.alteradas === 0 && r.jaEstavam === 0 && r.ficaram.length > 0) {
      return { error: `Nenhum lançamento mudou: ${r.ficaram[0]!.motivo}` };
    }
    return null;
  }

  return { error: "Proposta desconhecida." };
}
