"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ErroApi } from "@/lib/api-v1/erros";
import { criarTokenPessoal, revogarTokenPessoal, type TokenListado } from "@/lib/tokens-pessoais/servidor";

// Os tokens de acesso pela tela de Configurações (05/11/2026). O token em
// claro volta só na resposta de criar, uma vez; não vai para log nem para a URL.

type Falha = { error: string };

function mensagem(e: unknown): Falha {
  if (e instanceof ErroApi) return { error: e.message };
  console.error("[tokens-pessoais] Falha na operação", e instanceof Error ? e.name : "erro");
  return { error: "Não foi possível concluir. Atualize a página para conferir antes de tentar de novo." };
}

export async function criarTokenAction(dados: { name: string; scopes: string[]; days: number }): Promise<{ ok: true; token: string; registro: TokenListado } | Falha> {
  try {
    const r = await criarTokenPessoal(await getAuthContext(), dados);
    revalidatePath("/configuracoes");
    return { ok: true, ...r };
  } catch (e) { return mensagem(e); }
}

export async function revogarTokenAction(id: string): Promise<{ ok: true; registro: TokenListado } | Falha> {
  try {
    const registro = await revogarTokenPessoal(await getAuthContext(), id);
    revalidatePath("/configuracoes");
    return { ok: true, registro };
  } catch (e) { return mensagem(e); }
}
