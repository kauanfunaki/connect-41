"use server";

// As duas ações do diálogo de exclusão (ExcluirCadastro): a prévia do que está
// ligado e a exclusão. Valem para empresa, pessoa (as três populações) e
// usuário; as regras moram em src/lib/exclusao.
//
// Só administrador (ADMIN ou SUPER_ADMIN) — conferido aqui e de novo dentro do
// serviço, porque server action se chama por POST direto, sem passar pela tela.
//
// Sem revalidatePath de propósito: com ele o Next renderiza de novo a página
// em que a pessoa está (a ficha que acabou de sumir), a ficha cai no 404 e o
// diálogo some com o resultado. Quem atualiza é o diálogo, ao navegar para a
// lista — as listas são dinâmicas e vêm frescas.

import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { ASSINATURA_SOMENTE_LEITURA, papelExclui } from "@/lib/exclusao/comum";
import { SO_ADMIN_EXCLUI } from "@/lib/auth/papeis";
import { excluirEmpresaDeVez, previaDaEmpresa } from "@/lib/exclusao/empresa";
import { excluirPessoaDeVez, previaDaPessoa } from "@/lib/exclusao/pessoa";
import { excluirUsuarioDeVez, previaDoUsuario } from "@/lib/exclusao/usuario";
import type { PedidoDeExclusao, Previa, ResultadoDaExclusao, TipoDeCadastro } from "@/lib/exclusao/tipos";

const TIPOS: TipoDeCadastro[] = ["empresa", "pessoa", "usuario"];

export async function previaDaExclusao(tipo: TipoDeCadastro, id: string): Promise<{ previa: Previa } | { erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { erro: "Não autenticado." };
  if (!papelExclui(ctx.role)) return { erro: SO_ADMIN_EXCLUI };
  if (ctx.subscriptionReadOnly) return { erro: ASSINATURA_SOMENTE_LEITURA };
  if (!TIPOS.includes(tipo) || typeof id !== "string" || !id) return { erro: "Pedido inválido." };

  const prisma = getPrisma();
  try {
    const previa =
      tipo === "empresa"
        ? await previaDaEmpresa(prisma, ctx.tenantId, id)
        : tipo === "pessoa"
          ? await previaDaPessoa(prisma, ctx.tenantId, id)
          : await previaDoUsuario(prisma, ctx.tenantId, id, { id: ctx.userId, role: ctx.role });
    return previa ? { previa } : { erro: "Cadastro não encontrado." };
  } catch (err) {
    console.error("[previaDaExclusao]", err);
    return { erro: "Não foi possível montar a lista do que está ligado. Tente de novo." };
  }
}

export async function excluirCadastro(pedido: PedidoDeExclusao): Promise<ResultadoDaExclusao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { ok: false, erro: "Não autenticado." };
  if (!papelExclui(ctx.role)) return { ok: false, erro: SO_ADMIN_EXCLUI };
  if (ctx.subscriptionReadOnly) return { ok: false, erro: ASSINATURA_SOMENTE_LEITURA };
  if (
    !pedido ||
    !TIPOS.includes(pedido.tipo) ||
    typeof pedido.id !== "string" ||
    !pedido.id ||
    (pedido.modo !== "simples" && pedido.modo !== "completo")
  ) {
    return { ok: false, erro: "Pedido inválido." };
  }

  const prisma = getPrisma();
  const base = {
    tenantId: ctx.tenantId,
    ator: { id: ctx.userId, role: ctx.role },
    id: pedido.id,
    modo: pedido.modo,
    confirmacao: typeof pedido.confirmacao === "string" ? pedido.confirmacao : undefined,
  };
  const incluir = pedido.incluirOpcao === true;
  if (pedido.tipo === "empresa") return excluirEmpresaDeVez(prisma, { ...base, incluirFuncionarios: incluir });
  if (pedido.tipo === "pessoa") return excluirPessoaDeVez(prisma, base);
  return excluirUsuarioDeVez(prisma, { ...base, incluirFicha: incluir });
}
