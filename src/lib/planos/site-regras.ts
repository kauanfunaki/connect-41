// Os planos na seção "Planos" do site do Connect (14/10/2026) — as regras, sem
// banco: o que vem da tela de Planos, o que vai para o site e em que ordem.
//
// Decisão do Kauan (14/10): o site mostra os planos SEM preço por enquanto, e
// fica pronto para mostrar. O interruptor "Mostrar preços no site", em
// Administração › Planos, vale para todos os planos; desligado (o padrão), o
// preço nem sai do servidor — o cartão diz "Valor sob consulta".
//
// Puro, para servir à tela de Planos (componente de cliente), à leitura do
// banco (`./site`) e aos testes. A leitura que toca o banco mora em `./site`.

import type { BillingType, ManagementMode } from "@/generated/prisma/enums";
import type { ModuleDef } from "@/lib/module-catalog";
import { setoresIncluidos, lerModulosDoPlano, type ModulosDoSetor } from "./modulosPorSetor";

/** A chave do interruptor "Mostrar preços no site" em `configuracoes_do_connect`. */
export const CHAVE_PRECOS_NO_SITE = "site.mostrarPrecos";

/**
 * A chave do interruptor do cartão "Connect sob medida" (14/10/2026), na mesma
 * tabela. Ao contrário dos preços, começa LIGADO: sem a linha, o cartão
 * aparece — só "false" esconde (ver `lerCartaoSobMedida`).
 */
export const CHAVE_CARTAO_SOB_MEDIDA = "site.cartaoSobMedida";

export const MAX_DESTAQUES = 3;
export const MAX_PARA_QUEM = 240;
export const MAX_DESTAQUE = 80;
export const MAX_ORDEM = 99;

/** O "para quem é" de cada modo, quando o plano não tem o seu. */
export const PARA_QUEM_PADRAO: Record<ManagementMode, string> = {
  MANAGED: "A 41 Tech administra o Connect pelo seu escritório: usuários, setores e módulos.",
  SELF_SERVICE: "A sua equipe administra usuários, setores e módulos, com o suporte da 41 Tech.",
};

/** Como o plano aparece no site, do jeito que a tela de Planos edita. */
export type CamposDoSite = {
  mostrarNoSite: boolean;
  ordem: number;
  destacar: boolean;
  paraQuem: string | null;
  destaques: string[];
};

export const CAMPOS_DO_SITE_PADRAO: CamposDoSite = {
  mostrarNoSite: false,
  ordem: 1,
  destacar: false,
  paraQuem: null,
  destaques: [],
};

/** Os destaques guardados (lista de textos): só textos com conteúdo, no máximo três. */
export function lerDestaques(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, MAX_DESTAQUES);
}

/** Uma linha de `planos_no_site` como os campos da tela. */
export function camposDaLinha(linha: {
  mostrarNoSite: boolean;
  ordem: number;
  destacar: boolean;
  paraQuem: string | null;
  destaques: unknown;
}): CamposDoSite {
  return {
    mostrarNoSite: linha.mostrarNoSite,
    ordem: linha.ordem,
    destacar: linha.destacar,
    paraQuem: linha.paraQuem?.trim() || null,
    destaques: lerDestaques(linha.destaques),
  };
}

/**
 * Os campos do site enviados pela janela "Editar plano". Texto longo demais é
 * recusa, com a frase de onde está o problema — não corte em silêncio.
 */
export function lerCamposDoSite(form: FormData): { campos: CamposDoSite } | { erro: string } {
  const paraQuem = String(form.get("paraQuem") ?? "").trim();
  if (paraQuem.length > MAX_PARA_QUEM) return { erro: `O “Para quem é” passa de ${MAX_PARA_QUEM} letras.` };

  const destaques = form
    .getAll("destaque")
    .map((d) => String(d).trim())
    .filter(Boolean);
  if (destaques.length > MAX_DESTAQUES) return { erro: `São no máximo ${MAX_DESTAQUES} destaques.` };
  if (destaques.some((d) => d.length > MAX_DESTAQUE)) return { erro: `Cada destaque tem no máximo ${MAX_DESTAQUE} letras.` };

  const ordemTexto = String(form.get("ordem") ?? "").trim();
  const ordem = ordemTexto === "" ? CAMPOS_DO_SITE_PADRAO.ordem : Number(ordemTexto);
  if (!Number.isInteger(ordem) || ordem < 1 || ordem > MAX_ORDEM) return { erro: `A ordem no site é um número de 1 a ${MAX_ORDEM}.` };

  return {
    campos: {
      mostrarNoSite: form.get("mostrarNoSite") === "on",
      ordem,
      destacar: form.get("destacar") === "on",
      paraQuem: paraQuem || null,
      destaques,
    },
  };
}

/** Os mesmos campos? Igual ao que já está guardado, nada a gravar nem a auditar. */
export function camposIguais(a: CamposDoSite, b: CamposDoSite): boolean {
  return (
    a.mostrarNoSite === b.mostrarNoSite &&
    a.ordem === b.ordem &&
    a.destacar === b.destacar &&
    (a.paraQuem ?? "") === (b.paraQuem ?? "") &&
    a.destaques.length === b.destaques.length &&
    a.destaques.every((d, i) => d === b.destaques[i])
  );
}

/** O preço do cartão — só existe quando o interruptor está ligado. */
export type PrecoDoSite = {
  cobranca: BillingType;
  /** O valor mensal (fixo) ou por usuário, em reais. */
  valor: number;
  /** Taxa de implantação, em reais; 0 não aparece. */
  implantacao: number;
};

/** Um setor como etiqueta no site: código, nome e cor. */
export type SetorDoSite = Pick<ModulosDoSetor, "code" | "rotulo" | "cor">;

export type PlanoDoSite = {
  id: string;
  nome: string;
  modo: ManagementMode;
  paraQuem: string;
  destaques: string[];
  destacar: boolean;
  /** Os setores em que o plano libera algum módulo, na ordem do catálogo. */
  setores: SetorDoSite[];
  /** `null` com os preços escondidos — o valor nem sai do servidor. */
  preco: PrecoDoSite | null;
};

export type PlanosDoSite = {
  planos: PlanoDoSite[];
  mostrarPrecos: boolean;
  /**
   * O cartão "Connect sob medida", depois dos planos: os setores para escolher
   * (todo setor do catálogo que tem módulo). Nunca tem preço. `null` quando o
   * Super Admin escondeu o cartão em Planos.
   */
  sobMedida: { setores: SetorDoSite[] } | null;
};

/** O plano como vem do banco (`subscription_plans`). */
export type PlanoDoBanco = {
  id: string;
  name: string;
  managementMode: ManagementMode;
  billingType: BillingType;
  basePrice: unknown;
  pricePerUser: unknown;
  setupFee: unknown;
  allowedModuleCodes: unknown;
  active: boolean;
};

const reais = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const etiqueta = ({ code, rotulo, cor }: ModulosDoSetor): SetorDoSite => ({ code, rotulo, cor });

/**
 * Os setores do cartão "Connect sob medida": todo setor do catálogo que tem
 * algum módulo, na ordem das etiquetas dos planos — acompanha o catálogo
 * sozinho.
 */
export function setoresDoSobMedida(catalogo?: readonly ModuleDef[]): SetorDoSite[] {
  return setoresIncluidos(null, catalogo).map(etiqueta);
}

/**
 * A seção do site: só os planos ativos marcados "Mostrar no site", na ordem do
 * site (empate, pelo nome), com o preço só quando o interruptor está ligado.
 * Sem plano para mostrar, `null` — a seção some, e o link "Planos" do topo
 * junto (o cartão "Connect sob medida" vai com ela: ele não aparece sozinho).
 */
export function montarPlanosDoSite(
  planos: readonly PlanoDoBanco[],
  noSite: ReadonlyMap<string, CamposDoSite>,
  mostrarPrecos: boolean,
  cartaoSobMedida = true,
): PlanosDoSite | null {
  const visiveis = planos
    .filter((p) => p.active && noSite.get(p.id)?.mostrarNoSite)
    .map((p) => ({ plano: p, campos: noSite.get(p.id)! }))
    .sort((a, b) => a.campos.ordem - b.campos.ordem || a.plano.name.localeCompare(b.plano.name, "pt-BR"));
  if (visiveis.length === 0) return null;

  return {
    mostrarPrecos,
    sobMedida: cartaoSobMedida ? { setores: setoresDoSobMedida() } : null,
    planos: visiveis.map(({ plano, campos }) => ({
      id: plano.id,
      nome: plano.name,
      modo: plano.managementMode,
      paraQuem: campos.paraQuem ?? PARA_QUEM_PADRAO[plano.managementMode],
      destaques: campos.destaques,
      destacar: campos.destacar,
      setores: setoresIncluidos(lerModulosDoPlano(plano.allowedModuleCodes)).map(etiqueta),
      preco: mostrarPrecos
        ? {
            cobranca: plano.billingType,
            valor: reais(plano.billingType === "PER_USER_MONTHLY" ? plano.pricePerUser : plano.basePrice),
            implantacao: reais(plano.setupFee),
          }
        : null,
    })),
  };
}

/** O valor guardado do interruptor: só "true" liga. */
export function lerMostrarPrecos(valor: string | null | undefined): boolean {
  return valor === "true";
}

/** O valor guardado do cartão "Connect sob medida": sem valor (o padrão), aparece — só "false" esconde. */
export function lerCartaoSobMedida(valor: string | null | undefined): boolean {
  return valor !== "false";
}
