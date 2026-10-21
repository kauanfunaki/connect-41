"use server";

// Entrar, trocar e sair do foco — uma empresa por vez no BPO (15/10/2026).
//
// A escolha é um cookie (decisão do dono: sem tabela). Gravar ou apagar o
// cookie numa action faz o Next desenhar de novo a tela e o layout, então a
// faixa do topo e a lista da tela mudam juntas, sem recarregar.
//
// Não vai para a auditoria, de propósito: entrar e sair do foco é preferência
// de navegação, como a última empresa aberta, a troca de setor ou de
// escritório — nenhuma delas é registrada. O que o foco protege (a gravação)
// continua registrado em cada action.

import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { CAMPOS_DA_EMPRESA_NO_SELETOR, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import {
  COOKIE_DO_FOCO,
  SITUACOES_DO_FOCO,
  VALIDADE_DO_FOCO_EM_SEGUNDOS,
  descricaoDoFoco,
  valorDoCookieDoFoco,
} from "@/lib/empresas/foco";
import { empresaParaOFoco, opcoesDoCookieDoFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { gravarUltimaEmpresa } from "@/lib/empresas/ultimaEmpresa";

export type ResultadoDoFoco = { ok: true; descricao: string } | { ok: false; erro: string };

const SEM_ACESSO = "Trabalhar numa empresa por vez é das telas do BPO, e você não tem acesso a elas.";

/**
 * Passa a trabalhar só nesta empresa (e na matriz e nas filiais dela).
 *
 * Sem `redirect` daqui, de propósito: chamada pela faixa, que mora no layout,
 * o redirecionamento da action desmontaria o app inteiro por um instante. A
 * faixa navega sozinha depois (`FaixaDoFoco`).
 */
export async function trabalharNaEmpresa(companyId: string): Promise<ResultadoDoFoco> {
  if (typeof companyId !== "string" || companyId.length === 0 || companyId.length > 191) return { ok: false, erro: "Empresa não encontrada." };
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { ok: false, erro: "Não autenticado." };
  if (!(await podeUsarOFoco(ctx))) return { ok: false, erro: SEM_ACESSO };

  const foco = await empresaParaOFoco(ctx, companyId);
  if (!foco) return { ok: false, erro: "Esta empresa não pode ser escolhida: ela não existe mais, é de outro escritório ou não está ativa." };

  (await cookies()).set(
    COOKIE_DO_FOCO,
    valorDoCookieDoFoco({ tenantId: ctx.tenantId, userId: ctx.userId, companyId: foco.companyId }),
    opcoesDoCookieDoFoco(VALIDADE_DO_FOCO_EM_SEGUNDOS)
  );
  // Vira também a última aberta (21/10/2026): ao sair do foco, as telas
  // continuam nesta empresa, e não na que estava aberta antes dele.
  await gravarUltimaEmpresa(ctx, foco.companyId);
  return { ok: true, descricao: descricaoDoFoco(foco) };
}

/** Para de trabalhar numa empresa só: as telas do BPO voltam a mostrar todas. */
export async function pararDeTrabalharNaEmpresa(): Promise<{ ok: true }> {
  (await cookies()).set(COOKIE_DO_FOCO, "", opcoesDoCookieDoFoco(0));
  return { ok: true };
}

/**
 * As empresas do "Trocar empresa" da faixa: as em atividade do escritório.
 * Pedidas só quando a janela abre — a faixa aparece em toda tela do foco, e
 * a lista tem quase quatrocentas.
 */
export async function empresasParaOFoco(): Promise<
  { ok: true; empresas: (EmpresaParaEscolher & { nome: string })[] } | { ok: false; erro: string }
> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { ok: false, erro: "Não autenticado." };
  if (!(await podeUsarOFoco(ctx))) return { ok: false, erro: SEM_ACESSO };
  const empresas = await getPrisma().company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: [...SITUACOES_DO_FOCO] } },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });
  return {
    ok: true,
    empresas: empresas.map((e) => ({ id: e.id, nome: nomeExibicao(e), logoUrl: e.logoUrl, cnpj: e.cnpj, matrizId: e.parentCompanyId })),
  };
}
