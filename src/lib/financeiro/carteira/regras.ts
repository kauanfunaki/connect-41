// Painel da carteira do BPO (22/10/2026) — as regras, sem banco.
//
// Pedido para ficar perto do "painel de clientes" do Nibo BPO: uma linha por
// empresa atendida pelo BPO, com o que pede atenção em cada uma — vencido a
// pagar e a receber, há quanto tempo não entra extrato, o que falta conciliar,
// saldo que não bate, pendências e aprovações paradas e quando o cliente
// abriu o portal pela última vez. Nada aqui é dado novo: cada coluna é a
// contagem que a tela dela já faz, agrupada por empresa (ver `consultas.ts`).
//
// Esta primeira versão não tem o fechamento do mês: o Connect ainda não guarda
// "mês fechado" por empresa, e inventar a coluna seria mostrar um status que
// ninguém marca.

import { diasEntre } from "@/lib/financeiro/periodo";
import { normalizar } from "@/lib/buscaDeTelas";

export type SomaDeVencidos = { n: number; centavos: number };

export type LinhaDaCarteira = {
  companyId: string;
  nome: string;
  cnpj: string | null;
  /** O responsável da empresa no setor (`CompanyService.responsibleUserId`). */
  analistaId: string | null;
  analistaNome: string | null;
  vencidosPagar: SomaDeVencidos;
  vencidosReceber: SomaDeVencidos;
  /** Quantas contas bancárias ativas com extrato (OFX) a empresa tem. Zero: não há extrato a cobrar. */
  contasComExtrato: number;
  /** O dia da importação de extrato mais recente, entre as contas ativas; `null` = nunca. */
  ultimoExtratoKey: string | null;
  linhasAConciliar: number;
  /** Contas cujo saldo calculado não fecha com o saldo do banco (a conferência da conciliação). */
  contasComSaldoDivergente: number;
  pendenciasAbertas: number;
  aprovacoesAguardando: number;
  /** O último login no portal, entre os acessos ativos que enxergam a empresa. `null` = nunca, ou sem acesso. */
  ultimoAcessoPortal: Date | null;
  /** Quantos acessos ativos do portal enxergam a empresa. Zero: "sem acesso", e não "nunca entrou". */
  acessosAoPortal: number;
};

// ─── Dias sem extrato ───────────────────────────────────────────────────────

/**
 * Dias desde o último extrato importado. `null` quando a empresa não tem
 * conta com extrato — não há o que cobrar; `Infinity` quando tem conta e
 * nenhum extrato entrou, que é o pior caso e ordena como tal.
 */
export function diasSemExtrato(l: Pick<LinhaDaCarteira, "contasComExtrato" | "ultimoExtratoKey">, hojeKey: string): number | null {
  if (l.contasComExtrato === 0) return null;
  if (l.ultimoExtratoKey === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, diasEntre(l.ultimoExtratoKey, hojeKey));
}

export function textoDosDiasSemExtrato(dias: number | null): string {
  if (dias === null) return "sem conta";
  if (dias === Number.POSITIVE_INFINITY) return "nunca";
  if (dias === 0) return "hoje";
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** Uma semana sem extrato já atrasa a conciliação; um mês é a empresa parada. */
export function tomDosDiasSemExtrato(dias: number | null): "ok" | "atencao" | "critico" | "neutro" {
  if (dias === null) return "neutro";
  if (dias > 30) return "critico";
  if (dias > 7) return "atencao";
  return "ok";
}

// ─── Urgência ───────────────────────────────────────────────────────────────

/**
 * O "mais urgente primeiro" da abertura da tela: o que está vencido e o que
 * falta conciliar — é o trabalho atrasado, contado em itens. Saldo que não bate
 * pesa como dez linhas: é uma conta inteira que não fecha.
 */
export function urgencia(l: LinhaDaCarteira): number {
  return l.vencidosPagar.n + l.vencidosReceber.n + l.linhasAConciliar + l.contasComSaldoDivergente * 10;
}

// ─── Ordenação ──────────────────────────────────────────────────────────────

export const COLUNAS_DA_CARTEIRA = [
  { chave: "urgencia", rotulo: "Mais urgentes primeiro" },
  { chave: "empresa", rotulo: "Empresa" },
  { chave: "pagar", rotulo: "Vencido a pagar" },
  { chave: "receber", rotulo: "Vencido a receber" },
  { chave: "extrato", rotulo: "Dias sem extrato" },
  { chave: "conciliar", rotulo: "Linhas a conciliar" },
  { chave: "saldo", rotulo: "Saldo que não bate" },
  { chave: "pendencias", rotulo: "Pendências abertas" },
  { chave: "aprovacoes", rotulo: "Aprovações aguardando" },
  { chave: "portal", rotulo: "Último acesso ao portal" },
  { chave: "analista", rotulo: "Analista" },
] as const;

export type ColunaDaCarteira = (typeof COLUNAS_DA_CARTEIRA)[number]["chave"];
export type Sentido = "asc" | "desc";

/**
 * O sentido do primeiro clique: o pior primeiro. Nome em ordem alfabética; o
 * portal do acesso mais antigo para o mais novo (quem não entra é quem some);
 * número do maior para o menor.
 */
export function sentidoPadrao(coluna: ColunaDaCarteira): Sentido {
  return coluna === "empresa" || coluna === "analista" || coluna === "portal" ? "asc" : "desc";
}

export type OrdemDaCarteira = { coluna: ColunaDaCarteira; sentido: Sentido };

/**
 * A ordem na URL é um parâmetro só (`?ordem=pagar`, `?ordem=pagar.asc`): com
 * coluna e sentido separados, trocar a coluna pelo botão "Filtros" levaria o
 * sentido da anterior junto. Sem sentido, vale o padrão da coluna.
 */
export function ordemDaUrl(valor: string | null | undefined): OrdemDaCarteira {
  const [chave, sentido] = (valor ?? "").split(".");
  const coluna = COLUNAS_DA_CARTEIRA.find((c) => c.chave === chave)?.chave ?? "urgencia";
  return { coluna, sentido: sentido === "asc" || sentido === "desc" ? sentido : sentidoPadrao(coluna) };
}

/** O inverso de `ordemDaUrl`; a abertura da tela (urgência, do pior) é o vazio. */
export function ordemNaUrl(o: OrdemDaCarteira): string {
  if (o.sentido === sentidoPadrao(o.coluna)) return o.coluna === "urgencia" ? "" : o.coluna;
  return `${o.coluna}.${o.sentido}`;
}

function rotuloDoSentido(coluna: ColunaDaCarteira, sentido: Sentido): string {
  if (coluna === "empresa" || coluna === "analista") return sentido === "asc" ? "A a Z" : "Z a A";
  if (coluna === "portal") return sentido === "asc" ? "mais antigo primeiro" : "mais recente primeiro";
  return sentido === "desc" ? "maior primeiro" : "menor primeiro";
}

/** As ordens do botão "Filtros" — no celular não há cabeçalho para clicar. */
export function opcoesDeOrdem(): { value: string; label: string }[] {
  return COLUNAS_DA_CARTEIRA.flatMap((c) => {
    const padrao = sentidoPadrao(c.chave);
    const outro: Sentido = padrao === "asc" ? "desc" : "asc";
    return [padrao, outro].map((sentido) => ({
      value: ordemNaUrl({ coluna: c.chave, sentido }),
      label: c.chave === "urgencia" ? (sentido === padrao ? c.rotulo : "Menos urgentes primeiro") : `${c.rotulo}: ${rotuloDoSentido(c.chave, sentido)}`,
    }));
  }).filter((o) => o.value !== "");
}

/**
 * O valor de comparação da coluna. Texto vazio e "sem conta" vão sempre para o
 * fim, nos dois sentidos — `null` aqui quer dizer "não se aplica".
 */
function valorDaColuna(l: LinhaDaCarteira, coluna: ColunaDaCarteira, hojeKey: string): number | string | null {
  switch (coluna) {
    case "urgencia":
      return urgencia(l);
    case "empresa":
      return normalizar(l.nome);
    case "pagar":
      return l.vencidosPagar.centavos;
    case "receber":
      return l.vencidosReceber.centavos;
    case "extrato":
      return diasSemExtrato(l, hojeKey);
    case "conciliar":
      return l.linhasAConciliar;
    case "saldo":
      return l.contasComSaldoDivergente;
    case "pendencias":
      return l.pendenciasAbertas;
    case "aprovacoes":
      return l.aprovacoesAguardando;
    case "portal":
      // Sem acesso nenhum não se aplica; com acesso e nunca entrou, é o mais antigo.
      if (l.acessosAoPortal === 0) return null;
      return l.ultimoAcessoPortal ? l.ultimoAcessoPortal.getTime() : Number.NEGATIVE_INFINITY;
    case "analista":
      return l.analistaNome ? normalizar(l.analistaNome) : null;
  }
}

function comparar(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }
  return String(a).localeCompare(String(b), "pt-BR");
}

/**
 * Ordena pela coluna; empate pela urgência e depois pelo nome, para a ordem
 * não mudar de uma visita para outra.
 */
export function ordenarLinhas(linhas: LinhaDaCarteira[], coluna: ColunaDaCarteira, sentido: Sentido, hojeKey: string): LinhaDaCarteira[] {
  const fator = sentido === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const va = valorDaColuna(a, coluna, hojeKey);
    const vb = valorDaColuna(b, coluna, hojeKey);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null) {
      const c = comparar(va, vb) * fator;
      if (c !== 0) return c;
    }
    return urgencia(b) - urgencia(a) || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

// ─── Filtros ────────────────────────────────────────────────────────────────

export type FiltroDoAnalista = { tipo: "todos" } | { tipo: "sem" } | { tipo: "pessoa"; id: string };

/**
 * O analista da URL, ou o padrão: quem não é administrador e responde por
 * alguma empresa da carteira abre nas dele ("minhas"); o resto, em todas.
 * `?analista=todos` é a escolha explícita de ver todas.
 */
export function analistaDoFiltro(
  valor: string | null | undefined,
  quem: { userId: string; administrador: boolean },
  responsaveis: ReadonlySet<string>
): { filtro: FiltroDoAnalista; padrao: FiltroDoAnalista } {
  const padrao: FiltroDoAnalista =
    !quem.administrador && responsaveis.has(quem.userId) ? { tipo: "pessoa", id: quem.userId } : { tipo: "todos" };
  if (valor === "todos") return { filtro: { tipo: "todos" }, padrao };
  if (valor === "sem") return { filtro: { tipo: "sem" }, padrao };
  if (valor === "eu") return { filtro: { tipo: "pessoa", id: quem.userId }, padrao };
  if (valor && responsaveis.has(valor)) return { filtro: { tipo: "pessoa", id: valor }, padrao };
  return { filtro: padrao, padrao };
}

export function filtrarLinhas(linhas: LinhaDaCarteira[], filtro: { analista: FiltroDoAnalista; busca?: string | null }): LinhaDaCarteira[] {
  const termo = filtro.busca ? normalizar(filtro.busca) : "";
  const digitos = filtro.busca ? filtro.busca.replace(/\D/g, "") : "";
  return linhas.filter((l) => {
    if (filtro.analista.tipo === "sem" && l.analistaId !== null) return false;
    if (filtro.analista.tipo === "pessoa" && l.analistaId !== filtro.analista.id) return false;
    if (!termo) return true;
    if (normalizar(l.nome).includes(termo)) return true;
    // CNPJ com ou sem pontuação — só a partir de quatro dígitos, para "2" não achar todo mundo.
    return digitos.length >= 4 && (l.cnpj ?? "").replace(/\D/g, "").includes(digitos);
  });
}

// ─── Totais ─────────────────────────────────────────────────────────────────

export type TotaisDaCarteira = {
  empresas: number;
  vencidosPagar: SomaDeVencidos;
  vencidosReceber: SomaDeVencidos;
  linhasAConciliar: number;
  contasComSaldoDivergente: number;
  /** Empresas com conta de extrato e nada importado há mais de sete dias (ou nunca). */
  empresasSemExtratoRecente: number;
  pendenciasAbertas: number;
  aprovacoesAguardando: number;
};

export function totaisDaCarteira(linhas: LinhaDaCarteira[], hojeKey: string): TotaisDaCarteira {
  const t: TotaisDaCarteira = {
    empresas: linhas.length,
    vencidosPagar: { n: 0, centavos: 0 },
    vencidosReceber: { n: 0, centavos: 0 },
    linhasAConciliar: 0,
    contasComSaldoDivergente: 0,
    empresasSemExtratoRecente: 0,
    pendenciasAbertas: 0,
    aprovacoesAguardando: 0,
  };
  for (const l of linhas) {
    t.vencidosPagar.n += l.vencidosPagar.n;
    t.vencidosPagar.centavos += l.vencidosPagar.centavos;
    t.vencidosReceber.n += l.vencidosReceber.n;
    t.vencidosReceber.centavos += l.vencidosReceber.centavos;
    t.linhasAConciliar += l.linhasAConciliar;
    t.contasComSaldoDivergente += l.contasComSaldoDivergente;
    t.pendenciasAbertas += l.pendenciasAbertas;
    t.aprovacoesAguardando += l.aprovacoesAguardando;
    const dias = diasSemExtrato(l, hojeKey);
    if (dias !== null && dias > 7) t.empresasSemExtratoRecente += 1;
  }
  return t;
}
