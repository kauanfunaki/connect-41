// As telas do grupo "Geral" do menu lateral, por setor (14/10/2026).
//
// Pedido do Kauan: "tem telas no Geral que elas [o Recrutamento] não
// utilizariam, pelo fluxo da 41 Tallent — por exemplo Solicitações e
// Transferências. Conseguimos fazer com que essas telas possam ser escolhidas
// para não serem visíveis conforme setor?"
//
// O modelo é o do Meu dia por setor (`SectorTaskView`, ver taskWidgets.ts):
//   - a configuração é do escritório, por setor, e quem edita é o administrador;
//   - setor sem configuração vê tudo, como antes desta tela existir;
//   - quem está em mais de um setor vê a UNIÃO — a interseção esconderia
//     trabalho real de alguém.
//
// Uma diferença de propósito: aqui se guardam as telas ESCONDIDAS, e não as
// visíveis. Esconder é a exceção; uma tela nova que entrar no Geral amanhã
// aparece para todo setor, inclusive para quem já escondeu outras — em vez de
// nascer escondida justamente nos setores que já mexeram no menu. Chamados
// nasce com o módulo desativado; ao ativá-lo, segue a visibilidade normal.
//
// É VISIBILIDADE, NÃO PERMISSÃO. Esconder tira a tela do menu, do Ctrl+K, das
// telas fixadas e do tutorial; quem tiver o endereço continua abrindo a tela
// com o acesso que já tinha. Nada aqui é consultado para autorizar nada.
//
// Este arquivo é só regra — sem banco —, para o menu, a administração e os
// testes usarem a mesma conta. A leitura do banco mora em `menuGeralDb.ts`.

import type { UserRole } from "@/generated/prisma/enums";
import { isFullWrite } from "@/lib/auth/papeis";

/**
 * Quem configura o menu Geral de um setor: Administrador e Super Admin — os
 * mesmos que cadastram setores e ligam e desligam módulos (Configurações ›
 * Setores e › Módulos). Desligar um módulo já tira a tela do menu do escritório
 * inteiro; esconder do menu de um setor é menos que isso, então não faria
 * sentido exigir mais. O gestor do setor não configura: o menu vale para o
 * setor todo, e é decisão do escritório.
 *
 * Assinatura em somente leitura bloqueia, como qualquer gravação.
 */
export function podeConfigurarMenuGeral(ctx: { role: UserRole; subscriptionReadOnly: boolean }): boolean {
  return !ctx.subscriptionReadOnly && isFullWrite(ctx.role);
}

/** As telas do Geral que podem ser escondidas. Início e Meu dia nunca. */
export type TelaDoGeral = "espacos" | "cadastros" | "transferencias" | "solicitacoes" | "arquivos" | "agenda" | "chamados";

export type DefDaTelaDoGeral = {
  chave: TelaDoGeral;
  rotulo: string;
  descricao: string;
  /**
   * O módulo que precisa estar ligado no escritório para a tela existir no
   * menu. Desligado, a tela some para todos, com ou sem esta configuração.
   */
  modulo?: string;
  /** Só aparece com um setor escolhido no alto da tela (não em "Todos os setores"). */
  soDentroDoSetor?: boolean;
};

/**
 * Na ordem do menu.
 *
 * "Quadros" se chamava "Espaços" até 14/10/2026 (pedido do Kauan). A chave
 * continua `espacos`: é ela que fica gravada nas telas escondidas de cada setor
 * (`sector_menu_views.hiddenScreens`), e não o rótulo. O espaço, o contêiner
 * de pastas e listas dentro da tela, segue se chamando espaço.
 */
export const TELAS_DO_GERAL: readonly DefDaTelaDoGeral[] = [
  { chave: "chamados", rotulo: "Chamados", descricao: "Solicitações internas e acompanhamento do atendimento.", modulo: "helpdesk" },
  {
    chave: "espacos",
    rotulo: "Quadros",
    descricao: "As tarefas do setor, com as atividades em lista ou em kanban, organizadas em espaços e pastas.",
    soDentroDoSetor: true,
  },
  {
    chave: "cadastros",
    rotulo: "Cadastros",
    descricao: "Empresas, clientes e pessoas do escritório.",
  },
  {
    chave: "transferencias",
    rotulo: "Transferências",
    descricao: "Passar um trabalho de um setor para outro, com prazo e responsável.",
  },
  {
    chave: "solicitacoes",
    rotulo: "Solicitações",
    descricao: "O que os clientes pedem pelo portal, por assunto e setor.",
    modulo: "portal_solicitacoes",
  },
  {
    chave: "arquivos",
    rotulo: "Arquivos",
    descricao: "As pastas de cada empresa e do escritório, e o que fica compartilhado com o cliente.",
    modulo: "arquivos",
  },
  {
    chave: "agenda",
    rotulo: "Agenda",
    descricao: "Os prazos dos setores no calendário e as reuniões.",
  },
];

/** A disponibilidade inicial é controlada pelos módulos, sem ocultação adicional. */
export const TELAS_OCULTAS_POR_PADRAO: readonly TelaDoGeral[] = [];

/** Visibilidade efetiva do setor: padrões, escolhas explícitas e registros antigos. */
export function telasOcultasDoGeralDoSetor(
  setor: string,
  ocultasPorSetor: Readonly<Record<string, readonly TelaDoGeral[]>>,
  visiveisPorSetor: Readonly<Record<string, readonly TelaDoGeral[]>> = {},
): TelaDoGeral[] {
  const ocultas = new Set<TelaDoGeral>(TELAS_OCULTAS_POR_PADRAO);
  for (const tela of ocultasPorSetor[setor] ?? []) ocultas.add(tela);
  for (const tela of visiveisPorSetor[setor] ?? []) ocultas.delete(tela);
  return TODAS_AS_TELAS_DO_GERAL.filter((t) => ocultas.has(t));
}

/** O que fica no menu de qualquer jeito — a tela de configuração diz isso com estes nomes. */
export const TELAS_SEMPRE_NO_MENU: readonly string[] = ["Início", "Meu dia"];

const CHAVES = new Set<string>(TELAS_DO_GERAL.map((t) => t.chave));

export const TODAS_AS_TELAS_DO_GERAL: readonly TelaDoGeral[] = TELAS_DO_GERAL.map((t) => t.chave);

export function ehTelaDoGeral(valor: unknown): valor is TelaDoGeral {
  return typeof valor === "string" && CHAVES.has(valor);
}

/** A tela do Geral que um módulo representa — Solicitações e Arquivos —, ou null. */
export function telaDoGeralDoModulo(codigoDoModulo: string): TelaDoGeral | null {
  return TELAS_DO_GERAL.find((t) => t.modulo === codigoDoModulo)?.chave ?? null;
}

/**
 * As telas escondidas, lidas da coluna. Nunca confia no conteúdo: JSON
 * quebrado, chave que não existe mais ou repetida caem fora em vez de derrubar
 * o menu — e, na dúvida, nada fica escondido (o menu de antes).
 */
export function lerTelasOcultas(bruto: string | null | undefined): TelaDoGeral[] {
  return lerPreferenciasDoMenuGeral(bruto).ocultas;
}

/** Mantém a leitura dos arrays antigos e aceita escolhas explícitas do padrão oculto. */
export function lerPreferenciasDoMenuGeral(bruto: string | null | undefined): { ocultas: TelaDoGeral[]; visiveis: TelaDoGeral[] } {
  if (!bruto) return { ocultas: [], visiveis: [] };
  let lido: unknown;
  try { lido = JSON.parse(bruto); } catch { return { ocultas: [], visiveis: [] }; }
  if (Array.isArray(lido)) return { ocultas: limpar(lido), visiveis: [] };
  if (!lido || typeof lido !== "object") return { ocultas: [], visiveis: [] };
  const estado = lido as { ocultas?: unknown; visiveis?: unknown };
  return {
    ocultas: Array.isArray(estado.ocultas) ? limpar(estado.ocultas) : [],
    visiveis: Array.isArray(estado.visiveis) ? limpar(estado.visiveis) : [],
  };
}

/** Para gravar: só chaves conhecidas, sem repetição, na ordem do menu. */
export function gravarTelasOcultas(chaves: readonly unknown[]): string {
  return JSON.stringify(limpar(chaves));
}

export function gravarPreferenciasDoMenuGeral(ocultas: readonly unknown[], visiveis: readonly unknown[]): string {
  const esconder = limpar(ocultas);
  const mostrar = limpar(visiveis).filter((t) => TELAS_OCULTAS_POR_PADRAO.includes(t));
  return mostrar.length ? JSON.stringify({ ocultas: esconder, visiveis: mostrar }) : JSON.stringify(esconder);
}

export function alternarPreferenciaDoMenuGeral(
  estado: { ocultas: readonly TelaDoGeral[]; visiveis: readonly TelaDoGeral[] },
  tela: TelaDoGeral,
  visivel: boolean,
): { ocultas: TelaDoGeral[]; visiveis: TelaDoGeral[] } {
  const ocultas = new Set(estado.ocultas);
  const mostradas = new Set(estado.visiveis);
  if (visivel) {
    ocultas.delete(tela);
    if (TELAS_OCULTAS_POR_PADRAO.includes(tela)) mostradas.add(tela);
  } else {
    ocultas.add(tela);
    mostradas.delete(tela);
  }
  return {
    ocultas: TODAS_AS_TELAS_DO_GERAL.filter((t) => ocultas.has(t)),
    visiveis: TODAS_AS_TELAS_DO_GERAL.filter((t) => mostradas.has(t)),
  };
}

function limpar(valores: readonly unknown[]): TelaDoGeral[] {
  const pedidas = new Set(valores.filter(ehTelaDoGeral));
  return TODAS_AS_TELAS_DO_GERAL.filter((c) => pedidas.has(c));
}

/** As escondidas depois de ligar ou desligar uma tela. */
export function alternarTelaOculta(ocultas: readonly TelaDoGeral[], tela: TelaDoGeral, visivel: boolean): TelaDoGeral[] {
  const novo = new Set(ocultas);
  if (visivel) novo.delete(tela);
  else novo.add(tela);
  return limpar([...novo]);
}

/**
 * Quais setores decidem o Geral desta pessoa agora. `null` = ninguém recorta:
 * o menu mostra tudo.
 *
 *   - Com um setor escolhido no alto da tela: o desse setor. Vale também para
 *     o administrador — é como ele confere o que o setor está vendo.
 *   - Em "Todos os setores": a soma dos setores da pessoa.
 *   - Administrador, Super Admin e Somente leitura em "Todos os setores": tudo.
 *     A visão deles ali é o escritório inteiro, não a de um setor — e quem
 *     configura o menu precisa enxergar todas as telas.
 *
 * É a mesma regra do escopo de leitura do resto do app (`sectorScope`).
 */
export function setoresQueDecidemOGeral(activeSector: string | null, setoresDaPessoa: readonly string[], acessoTotal: boolean): string[] | null {
  if (activeSector) return [activeSector];
  if (acessoTotal) return null;
  return [...setoresDaPessoa];
}

/**
 * As telas do Geral que aparecem, na ordem do menu.
 *
 * `setores` é o resultado de `setoresQueDecidemOGeral`. Sem recorte, todos
 * seguem os padrões gerais; telas novas aparecem por padrão, exceto as que
 * foram declaradas inicialmente escondidas.
 */
export function telasDoGeralVisiveis(
  setores: readonly string[] | null,
  ocultasPorSetor: Readonly<Record<string, readonly TelaDoGeral[]>>,
  visiveisPorSetor: Readonly<Record<string, readonly TelaDoGeral[]>> = {},
): TelaDoGeral[] {
  if (setores === null || setores.length === 0) return TODAS_AS_TELAS_DO_GERAL.filter((t) => !TELAS_OCULTAS_POR_PADRAO.includes(t));
  const aparece = new Set<TelaDoGeral>();
  for (const setor of setores) {
    const ocultas = new Set(telasOcultasDoGeralDoSetor(setor, ocultasPorSetor, visiveisPorSetor));
    for (const tela of TODAS_AS_TELAS_DO_GERAL) if (!ocultas.has(tela)) aparece.add(tela);
  }
  return TODAS_AS_TELAS_DO_GERAL.filter((t) => aparece.has(t));
}

/**
 * Tira de uma lista de telas de módulo (o Ctrl+K, as fixadas, as telas de um
 * setor) as que são do Geral e estão escondidas agora. As demais passam.
 */
export function semTelasDoGeralOcultas<T extends { code: string }>(telas: readonly T[], visiveis: readonly TelaDoGeral[]): T[] {
  const aparece = new Set(visiveis);
  return telas.filter((t) => {
    const tela = telaDoGeralDoModulo(t.code);
    return tela === null || aparece.has(tela);
  });
}
