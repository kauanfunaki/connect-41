// A leitura do banco dos planos no site do Connect (14/10/2026). As regras
// (o que vai, em que ordem, quando o preço aparece) estão em `./site-regras`.
//
// Nunca derruba nada: sem as tabelas novas (deploy antes da migration
// 20261014182500), com o banco recusando a leitura ou demorando, o site
// esconde a seção Planos e a tela de Planos mostra os planos de antes, com o
// aviso de que falta a atualização do banco.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import {
  CHAVE_CARTAO_SOB_MEDIDA,
  CHAVE_PRECOS_NO_SITE,
  camposDaLinha,
  lerCartaoSobMedida,
  lerMostrarPrecos,
  montarPlanosDoSite,
  type CamposDoSite,
  type PlanosDoSite,
} from "./site-regras";

/** `sem-tabela`: a migration ainda não rodou. `erro`: o banco recusou a leitura. */
export type SituacaoDoSite = "ok" | "sem-tabela" | "erro";

export type AjustesDoSite = {
  /** Os campos do site de cada plano que já tem linha em `planos_no_site`. */
  porPlano: Map<string, CamposDoSite>;
  mostrarPrecos: boolean;
  /** O cartão "Connect sob medida": ligado sem a linha na tabela (o padrão). */
  cartaoSobMedida: boolean;
  situacao: SituacaoDoSite;
};

// A falta das tabelas se repete a cada visita ao site até a migration rodar:
// avisa uma vez por processo.
let avisouSemTabela = false;

/**
 * Os ajustes do site de todos os planos e os dois interruptores (preços e o
 * cartão "Connect sob medida"), numa leitura só da tabela de configurações.
 * Nunca lança.
 */
export async function lerAjustesDoSite(): Promise<AjustesDoSite> {
  try {
    const prisma = getPrisma();
    const [linhas, chaves] = await Promise.all([
      prisma.planoNoSite.findMany(),
      prisma.configuracaoDoConnect.findMany({ where: { chave: { in: [CHAVE_PRECOS_NO_SITE, CHAVE_CARTAO_SOB_MEDIDA] } } }),
    ]);
    const valor = (chave: string) => chaves.find((c) => c.chave === chave)?.valor;
    return {
      porPlano: new Map(linhas.map((l) => [l.planId, camposDaLinha(l)])),
      mostrarPrecos: lerMostrarPrecos(valor(CHAVE_PRECOS_NO_SITE)),
      cartaoSobMedida: lerCartaoSobMedida(valor(CHAVE_CARTAO_SOB_MEDIDA)),
      situacao: "ok",
    };
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      if (!avisouSemTabela) {
        avisouSemTabela = true;
        console.warn("[planos no site] tabelas planos_no_site/configuracoes_do_connect ainda não existem: a seção Planos fica fora do site até rodar a migration.");
      }
      return { porPlano: new Map(), mostrarPrecos: false, cartaoSobMedida: true, situacao: "sem-tabela" };
    }
    console.error("[planos no site] ajustes", err);
    return { porPlano: new Map(), mostrarPrecos: false, cartaoSobMedida: true, situacao: "erro" };
  }
}

/** Quanto o site espera o banco antes de desistir da seção — a página não pode travar por ela. */
const ESPERA_MAXIMA_MS = 3000;

async function consultarPlanosDoSite(): Promise<PlanosDoSite | null> {
  const ajustes = await lerAjustesDoSite();
  if (ajustes.situacao !== "ok") return null;
  const marcados = [...ajustes.porPlano].filter(([, c]) => c.mostrarNoSite).map(([id]) => id);
  if (marcados.length === 0) return null;
  const planos = await getPrisma().subscriptionPlan.findMany({
    where: { id: { in: marcados }, active: true },
    select: {
      id: true,
      name: true,
      managementMode: true,
      billingType: true,
      basePrice: true,
      pricePerUser: true,
      setupFee: true,
      allowedModuleCodes: true,
      active: true,
    },
  });
  return montarPlanosDoSite(planos, ajustes.porPlano, ajustes.mostrarPrecos, ajustes.cartaoSobMedida);
}

/**
 * A seção "Planos" do site: `null` quando não há plano para mostrar, e também
 * quando as tabelas não existem, o banco falha ou demora mais de 3 s — a seção
 * some e o resto do site abre normalmente. Nunca lança.
 */
export async function lerPlanosDoSite(esperaMaximaMs = ESPERA_MAXIMA_MS): Promise<PlanosDoSite | null> {
  const consulta = consultarPlanosDoSite().catch((err) => {
    console.error("[planos no site] leitura", err);
    return null;
  });
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const desistir = new Promise<null>((resolve) => {
    relogio = setTimeout(() => resolve(null), esperaMaximaMs);
  });
  try {
    return await Promise.race([consulta, desistir]);
  } finally {
    clearTimeout(relogio);
  }
}
