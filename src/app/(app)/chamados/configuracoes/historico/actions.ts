"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { contexto, exigirEscrita } from "@/lib/chamados/contexto";
import { podeGerenciar } from "@/lib/chamados/acesso";
import { importarHistoricoDoHub, processarTudo, revisarCaso, type DecisaoDaRevisao } from "@/lib/chamados/historico-servidor";
import { motivoDaFalha } from "@/lib/chamados/falhaDaIa";

// O histórico de chamados do Hub (17/11/2026): trazer e revisar. Quem pode: a
// equipe que gerencia os chamados (a mesma da tela Configurar).

const CAMINHO = "/chamados/configuracoes/historico";

async function quemGerencia() {
  const c = await contexto();
  exigirEscrita(c);
  if (!podeGerenciar(c.ctx, c.config)) throw new Error("Só quem gerencia os chamados mexe no histórico.");
  return c;
}

export async function importarHistorico(): Promise<{ ok: true; novos: number; jaExistiam: number } | { ok: false; erro: string }> {
  try {
    const c = await quemGerencia();
    const r = await importarHistoricoDoHub(c.ctx.tenantId, c.ctx.userId);
    // A IA lê os casos novos depois da resposta; o que sobrar, o motor de alertas lê.
    if (r.novos > 0) after(() => processarTudo(c.ctx.tenantId).catch((err) => console.error("[chamados] histórico do Hub:", motivoDaFalha(err))));
    revalidatePath(CAMINHO);
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Não foi possível trazer o histórico." };
  }
}

export async function revisarCasoDoHistorico(id: string, decisao: DecisaoDaRevisao): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const c = await quemGerencia();
    if (typeof id !== "string" || !id) throw new Error("Caso não encontrado.");
    const valida = decisao && (("descartar" in decisao && decisao.descartar === true) || ("categoryId" in decisao && typeof decisao.categoryId === "string"));
    if (!valida) throw new Error("Escolha uma categoria ou descarte o caso.");
    await revisarCaso(c.ctx.tenantId, c.ctx.userId, id, decisao);
    revalidatePath(CAMINHO);
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Não foi possível salvar a revisão." };
  }
}
