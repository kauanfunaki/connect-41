// Quem vê qual painel da Home (30/09).
//
// A regra é a da tela de onde os números saem: o painel de contas aparece para
// quem abre /pagar, o de processos para quem abre /processos — módulo ativo no
// tenant e acesso ao setor que opera o módulo (resolvido, porque um tenant pode
// mover o módulo de setor). Painel que mostrasse o que a tela esconde seria
// um vazamento pela porta da frente.
//
// Com um setor ativo (o seletor da topbar), só entram os painéis dele: a Home
// do BPO não mostra o funil do Recrutamento.

import { canActOnSector, canViewSector, type AuthContext } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import type { HomeWidgetKey } from "@/lib/homeWidgets";

type Regra = { modulo: string; acesso: "ver" | "agir" };

/**
 * Cada painel e as telas que ele resume, com o gate de cada uma (o mesmo da
 * página: /pagar, /receber e /processos pedem `canActOnSector`; /pendencias,
 * /aprovacoes e /certificados, `canViewSector`). Basta uma passar; o painel
 * mostra só a parte das que passaram.
 */
const REGRAS: Partial<Record<HomeWidgetKey, Regra[]>> = {
  "painel-contas": [
    { modulo: "bpo_contas_pagar", acesso: "agir" },
    { modulo: "bpo_contas_receber", acesso: "agir" },
  ],
  "painel-semanas": [{ modulo: "bpo_contas_pagar", acesso: "agir" }],
  "painel-pendencias": [
    { modulo: "bpo_pendencias", acesso: "ver" },
    { modulo: "bpo_aprovacoes", acesso: "ver" },
  ],
  "painel-processos": [{ modulo: "societario_processos", acesso: "agir" }],
  // As telas do DP não têm gate próprio (achado de 30/09, no Quadro); o painel
  // pede o setor, senão aparecia para a empresa inteira.
  "painel-dp": [{ modulo: "dp_colaboradores", acesso: "ver" }],
  "painel-recrutamento": [{ modulo: "recrutamento_vagas", acesso: "ver" }],
  "painel-certificados": [{ modulo: "tech_certificados", acesso: "ver" }],
};

export type AcessoDoPainel = {
  /** O setor que opera o módulo — dá o nome e a cor do painel. */
  setor: string;
  /** Os módulos do painel que este usuário alcança. */
  modulos: ReadonlySet<string>;
};

export async function acessoDosPaineis(ctx: AuthContext): Promise<Map<HomeWidgetKey, AcessoDoPainel>> {
  const acesso = new Map<HomeWidgetKey, AcessoDoPainel>();
  if (!ctx.tenantId) return acesso;
  const estados = await getTenantModuleStates(ctx.tenantId);

  for (const [chave, regras] of Object.entries(REGRAS) as [HomeWidgetKey, Regra[]][]) {
    let setor: string | null = null;
    const modulos = new Set<string>();
    for (const r of regras) {
      const estado = estados.find((e) => e.code === r.modulo);
      if (!estado?.enabled) continue;
      if (ctx.activeSector && estado.sectorCode !== ctx.activeSector) continue;
      const pode = r.acesso === "agir" ? canActOnSector(ctx, estado.sectorCode) : canViewSector(ctx, estado.sectorCode);
      if (!pode) continue;
      setor ??= estado.sectorCode;
      modulos.add(r.modulo);
    }
    if (setor) acesso.set(chave, { setor, modulos });
  }
  return acesso;
}
