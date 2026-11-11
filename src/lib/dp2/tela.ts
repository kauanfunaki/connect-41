// A porta das telas de empresa do DP 2 (11/11/2026): o módulo, a empresa da
// faixa "Trabalhando em" e o que a pessoa pode fazer nela.

import { canActOnSector, canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { escolherEmpresaDaTela } from "@/lib/empresas/ultimaEmpresa";

export async function abrirTelaDeEmpresaDoDp2(modulo: string, pedida: string | undefined) {
  const { ctx, setor } = await abrirTelaDoModulo(modulo);
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const { escolha, empresa, foco } = await escolherEmpresaDaTela(ctx, pedida, empresas, { comFoco: true });
  return {
    ctx,
    tenantId: ctx.tenantId,
    escolha,
    empresa,
    foco,
    temEmpresas: empresas.length > 0,
    podeAgir: canActOnSector(ctx, setor),
    podeGerir: canManageSector(ctx, setor),
  };
}

export const NOME_DO_TIPO_DE_COMPETENCIA: Record<string, string> = {
  MENSAL: "Folha mensal",
  DECIMO_1: "13º — 1ª parcela",
  DECIMO_2: "13º — 2ª parcela",
};

export const NOME_DA_SITUACAO: Record<string, string> = {
  ABERTA: "Aberta",
  CALCULADA: "Calculada",
  FECHADA: "Fechada",
};

export const TOM_DA_SITUACAO: Record<string, "neutro" | "atencao" | "sucesso" | "marca"> = {
  ABERTA: "atencao",
  CALCULADA: "marca",
  FECHADA: "sucesso",
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function nomeDaCompetencia(ano: number, mes: number): string {
  return `${MESES[mes - 1]}/${ano}`;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : REAIS.format(v));

/** "AAAA-MM" do mês atual em São Paulo. */
export function mesAtual(): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
  return partes.slice(0, 7);
}
