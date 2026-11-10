"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import type { ActionState } from "@/lib/actionState";
import {
  QUANTOS_CARTOES,
  cartoesDisponiveis,
  ehChaveDeCartao,
  gravarEscolhas,
  padraoDoCodigo,
  podeDefinirPadraoDoSetor,
  resolverCartoes,
  trocarNaPosicao,
  type CartaoPronto,
} from "@/lib/home/cartoes";
import {
  ambienteDosCartoes,
  cartoesProntos,
  escolhasDosCartoes,
  gravarEscolhaDaPessoa,
  gravarPadraoDoSetor,
  idDoSetor,
} from "@/lib/home/cartoesServidor";

// Os cartões coringa do topo do Início (10/11/2026, pedido do Kauan): o lápis
// de cada cartão troca o número — "Só para mim" ou, para quem coordena o setor
// ativo, "Padrão do {setor}" — e "Voltar ao do setor" desfaz a escolha da
// pessoa. A action é a barreira: o que o componente mostra é cortesia.

const FALTA_A_MIGRATION =
  "Falta atualizar o banco para guardar os cartões do Início (a migration “cartoes_coringa_do_inicio”). Até lá vale o padrão do setor.";

export type ParaQuem = "pessoa" | "setor";

/**
 * Os cartões prontos (número, tom, variação e linha) do que a pessoa vê — a
 * lista do lápis, contada só quando ela abre — ou só dos pedidos (o "Tentar
 * de novo" de um cartão que falhou). Chave que ela não vê nunca é contada.
 */
export async function carregarCartoes(chaves?: string[]): Promise<{ cartoes: CartaoPronto[] } | { error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  try {
    const amb = await ambienteDosCartoes(ctx.tenantId);
    const disponiveis = cartoesDisponiveis(ctx, amb).map((d) => d.chave);
    const pedidas = Array.isArray(chaves) ? disponiveis.filter((c) => chaves.includes(c)) : disponiveis;
    return { cartoes: await cartoesProntos(ctx, pedidas) };
  } catch (err) {
    console.error("[carregarCartoes]", err);
    return { error: "Não deu para carregar os números agora." };
  }
}

/**
 * Põe `chave` na `posicao` (0 a 3) — para a pessoa ou, quando ela coordena o
 * setor ativo, para o padrão do setor. Se o cartão já está em outra posição,
 * os dois trocam de lugar.
 */
export async function trocarCartaoDoInicio(posicao: number, chave: string, para: ParaQuem): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!Number.isInteger(posicao) || posicao < 0 || posicao >= QUANTOS_CARTOES) return { error: "Cartão inválido." };
  if (!ehChaveDeCartao(chave)) return { error: "Esse indicador não existe mais. Recarregue a página." };
  if (para !== "pessoa" && para !== "setor") return { error: "Escolha para quem vale a troca." };

  const setorAtivo = ctx.activeSector;
  if (para === "setor" && (!setorAtivo || !podeDefinirPadraoDoSetor(ctx))) {
    return { error: "Só quem coordena o setor muda o padrão dele." };
  }

  const amb = await ambienteDosCartoes(ctx.tenantId);
  const disponiveis = cartoesDisponiveis(ctx, amb).map((d) => d.chave);
  // A preferência não é canal de acesso: o que a pessoa não vê não entra.
  if (!disponiveis.includes(chave)) return { error: "Você não tem acesso a esse indicador." };

  const escolhas = await escolhasDosCartoes(ctx.tenantId, ctx.userId, setorAtivo);

  try {
    if (para === "setor" && setorAtivo) {
      const idSetor = await idDoSetor(ctx.tenantId, setorAtivo);
      if (!idSetor) return { error: "Setor não encontrado neste escritório." };
      const padrao = padraoDoCodigo(setorAtivo);
      // O padrão de agora, posição por posição (o gravado ou o do código).
      const doSetor = Array.from({ length: QUANTOS_CARTOES }, (_, i) => escolhas.setor?.[i] ?? padrao[i] ?? null);
      const novas = trocarNaPosicao(doSetor, posicao, chave, doSetor);
      await gravarPadraoDoSetor(ctx, setorAtivo, gravarEscolhas(novas) ?? "[]");
      // O cartão que o coordenador trocou passa a seguir o setor na tela dele
      // também — senão a escolha pessoal antiga escondia a troca que ele fez.
      if (escolhas.pessoa?.[posicao]) {
        const dele = [...escolhas.pessoa];
        dele[posicao] = null;
        await gravarEscolhaDaPessoa(ctx, gravarEscolhas(dele));
      }
      await logAudit({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "sector.inicio.cartao",
        entityType: "Sector",
        entityId: idSetor,
        metadata: { setor: setorAtivo, posicao: posicao + 1, de: doSetor[posicao], para: chave },
      });
    } else {
      // O que a pessoa vê agora decide a troca de lugar (`trocarNaPosicao`).
      const mostrados = resolverCartoes({ pessoa: escolhas.pessoa, setor: escolhas.setor, setorAtivo, disponiveis }).map(
        (r) => r?.chave ?? null
      );
      await gravarEscolhaDaPessoa(ctx, gravarEscolhas(trocarNaPosicao(escolhas.pessoa, posicao, chave, mostrados)));
    }
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { error: FALTA_A_MIGRATION };
    console.error("[trocarCartaoDoInicio]", err);
    return { error: "Não deu para trocar o cartão. Tente de novo." };
  }

  revalidatePath("/home");
  return null;
}

/** Desfaz a escolha da pessoa numa posição: o cartão volta a ser o do setor (ou o padrão). */
export async function voltarCartaoAoDoSetor(posicao: number): Promise<ActionState> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { error: "Não autenticado" };
  if (!Number.isInteger(posicao) || posicao < 0 || posicao >= QUANTOS_CARTOES) return { error: "Cartão inválido." };

  const { pessoa } = await escolhasDosCartoes(ctx.tenantId, ctx.userId, ctx.activeSector);
  if (!pessoa?.[posicao]) return null;
  const novas = [...pessoa];
  novas[posicao] = null;
  try {
    await gravarEscolhaDaPessoa(ctx, gravarEscolhas(novas));
  } catch (err) {
    if (isPrismaMissingTableError(err)) return { error: FALTA_A_MIGRATION };
    console.error("[voltarCartaoAoDoSetor]", err);
    return { error: "Não deu para voltar o cartão. Tente de novo." };
  }
  revalidatePath("/home");
  return null;
}
