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
  const auxiliar = ["fiscal_painel", "fiscal_acervo", "fiscal_conferencia"].find((code) => ativos.has(code));
  const href = telas[0]?.href ?? (auxiliar ? getModuleRoute(auxiliar) : undefined);
  const laterais = [
    ...(href ? [{ label: "Classificação e apuração", href, modulo: "fiscal_classificacao" }] : []),
    ...(ativos.has("fiscal_entregas") ? [{ label: "SPED gerados", href: "/fiscal/entregas", modulo: "fiscal_entregas" }] : []),
    ...(ativos.has("fiscal_operacao") ? [{ label: "Executar", href: "/fiscal/operacao", modulo: "fiscal_operacao" }] : []),
  ];
  return { telas, href, laterais };
}

export function areaSpedAtiva(pathname: string): "SPED" | "SPED gerados" | "Executar" | undefined {
  if (pathname === "/fiscal/entregas") return "SPED gerados";
  if (pathname === "/fiscal/operacao") return "Executar";
  if (pathname === "/fiscal" || pathname.startsWith("/fiscal/")) return "SPED";
}
