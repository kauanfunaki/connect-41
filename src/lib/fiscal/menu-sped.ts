import { getModuleRoute } from "@/lib/module-catalog";

// Agrupar no menu não altera a ativação independente de cada módulo.
export const MODULOS_SPED: ReadonlySet<string> = new Set([
  "fiscal_painel", "fiscal_classificacao", "fiscal_operacao", "fiscal_acervo",
  "fiscal_icms_ipi", "fiscal_contribuicoes", "fiscal_entregas",
  "fiscal_conferencia", "fiscal_configuracoes",
]);

export function menuSped(modulos: readonly { code: string; href: string }[]) {
  const ativos = new Set(modulos.map((m) => m.code));
  const telas = [
    { modulo: "fiscal_classificacao", label: "Classificação", href: "/fiscal/classificacao" },
    { modulo: ativos.has("fiscal_icms_ipi") ? "fiscal_icms_ipi" : "fiscal_contribuicoes", label: "Apuração", href: ativos.has("fiscal_icms_ipi") ? "/fiscal/icms-ipi" : "/fiscal/contribuicoes" },
    { modulo: "fiscal_configuracoes", label: "De-Para CFOP", href: "/fiscal/configuracoes?aba=depara" },
    { modulo: "fiscal_configuracoes", label: "Regras", href: "/fiscal/configuracoes?aba=regras" },
    { modulo: "fiscal_icms_ipi", label: "DCIP e DIME", href: "/fiscal/icms-ipi?aba=dcip-dime" },
  ].filter((t) => ativos.has(t.modulo));
  const primeiro = modulos.find((m) => MODULOS_SPED.has(m.code));
  return { telas, href: ativos.has("fiscal_painel") ? getModuleRoute("fiscal_painel")! : primeiro?.href };
}
