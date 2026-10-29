import { getModuleRoute } from "@/lib/module-catalog";
import { CAMINHO_DO_SPED, ETAPAS_DO_SPED } from "@/lib/fiscal/sped/etapas";

// Agrupar no menu não altera a ativação independente de cada módulo.
export const MODULOS_SPED: ReadonlySet<string> = new Set([
  "fiscal_painel", "fiscal_classificacao", "fiscal_operacao", "fiscal_acervo",
  "fiscal_icms_ipi", "fiscal_contribuicoes", "fiscal_entregas",
  "fiscal_conferencia", "fiscal_configuracoes",
]);

/**
 * No modo motor (26/10/2026) o menu só leva a telas com fonte: De-Para e
 * Regras não existem na API do motor, e Configurações é o cadastro das
 * empresas no motor.
 */
export function menuSped(modulos: readonly { code: string; href: string }[], { motor = false }: { motor?: boolean } = {}) {
  const ativos = new Set(modulos.map((m) => m.code));
  const telas = [
    { modulo: "fiscal_classificacao", label: "Classificação", href: "/fiscal/classificacao" },
    { modulo: ativos.has("fiscal_icms_ipi") ? "fiscal_icms_ipi" : "fiscal_contribuicoes", label: "Apuração", href: ativos.has("fiscal_icms_ipi") ? "/fiscal/icms-ipi" : "/fiscal/contribuicoes" },
    ...(motor ? [{ modulo: "fiscal_configuracoes", label: "Empresas", href: "/fiscal/configuracoes" }] : [
      { modulo: "fiscal_configuracoes", label: "De-Para CFOP", href: "/fiscal/configuracoes?aba=depara" },
      { modulo: "fiscal_configuracoes", label: "Regras", href: "/fiscal/configuracoes?aba=regras" },
    ]),
    { modulo: "fiscal_icms_ipi", label: "DCIP e DIME", href: "/fiscal/icms-ipi?aba=dcip-dime" },
  ].filter((t) => ativos.has(t.modulo));
  const auxiliar = ["fiscal_acervo", "fiscal_conferencia"].find((code) => ativos.has(code));
  // O SPED em quatro etapas (29/10/2026): Classificação, Apuração, Fechamento e
  // Gerar SPED numa tela só, com a empresa escolhida como no BPO. É a entrada
  // do item SPED; as telas antigas continuam abrindo pelo endereço.
  const etapas = ETAPAS_DO_SPED.some((e) => ativos.has(e.modulo));
  const href = etapas ? CAMINHO_DO_SPED : (telas[0]?.href ?? (auxiliar ? getModuleRoute(auxiliar) : undefined));
  const laterais: { label: string; href: string; modulo: string; area: AreaDoSped }[] = [
    ...(ativos.has("fiscal_painel") ? [{ label: "Painel", href: "/fiscal", modulo: "fiscal_painel", area: "Painel" as const }] : []),
    ...(href ? [{ label: etapas ? "SPED ICMS/IPI" : "Classificação e apuração", href, modulo: "fiscal_classificacao", area: "SPED" as const }] : []),
    ...(ativos.has("fiscal_entregas") ? [{ label: "SPED gerados", href: "/fiscal/entregas", modulo: "fiscal_entregas", area: "SPED gerados" as const }] : []),
    ...(ativos.has("fiscal_operacao") ? [{ label: "Executar", href: "/fiscal/operacao", modulo: "fiscal_operacao", area: "Executar" as const }] : []),
  ];
  return { telas, href, laterais };
}

// "SPED" marca "Classificação e apuração"; documentos e conferência não têm
// entrada lateral própria e só acendem o item SPED (26/10/2026).
export type AreaDoSped = "SPED" | "Painel" | "SPED gerados" | "Executar" | "Outras";

export function areaSpedAtiva(pathname: string): AreaDoSped | undefined {
  if (pathname === "/fiscal") return "Painel";
  if (pathname === "/fiscal/entregas") return "SPED gerados";
  if (pathname === "/fiscal/operacao") return "Executar";
  if ([CAMINHO_DO_SPED, "/fiscal/classificacao", "/fiscal/icms-ipi", "/fiscal/contribuicoes", "/fiscal/configuracoes"].some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "SPED";
  if (pathname.startsWith("/fiscal/")) return "Outras";
}
