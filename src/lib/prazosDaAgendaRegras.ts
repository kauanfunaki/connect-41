// As regras puras dos prazos da Agenda e do Meu dia: o formato do prazo, como
// os do mesmo dia se juntam, o que é atraso e como as duas fontes novas de
// 10/11/2026 (pedido do Kauan) viram prazo — a data legal das obrigações, com o
// risco de multa, e o vencimento das guias. A busca no banco está em
// prazosDaAgenda.ts; aqui não entra Prisma, para os componentes de cliente e
// os testes importarem sem puxar o banco.

import { ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";
import { riscoDeMulta } from "@/lib/obrigacoes/riscoDeMulta";
import type { Feriados } from "@/lib/obrigacoes/calendario";
import { fonteDoTipo, tipoAtrasa, type FonteDaAgenda, type TipoDePrazo } from "@/lib/fontesDaAgenda";
import { enderecoDaTarefa } from "@/lib/enderecoCurto";

export type { TipoDePrazo, FonteDaAgenda };

export type PrazoDaAgenda = {
  chave: string;
  /** Dia do prazo, no calendário de Brasília (AAAA-MM-DD). */
  dia: string;
  tipo: TipoDePrazo;
  /** A fonte do prazo (o botão que liga e desliga) — dá a cor na lista e no mês. */
  fonte: FonteDaAgenda;
  titulo: string;
  /** Segunda linha: empresa, valor, quem. */
  detalhe?: string;
  /** Código do setor que responde pelo prazo — dá a cor na grade de dia e de semana. */
  setor: string;
  href: string;
  /** Quantos prazos esta entrada junta (1 quando é um só). */
  quantos: number;
  /** A data passou e o prazo continua aberto — só nos tipos em que isso é atraso (`tipoAtrasa`). */
  atrasada?: boolean;
  /** Obrigação aberta a poucos dias úteis da data legal, nela ou logo depois (`riscoDeMulta`). */
  riscoDeMulta?: boolean;
  /** Na entrada que junta vários: cada um deles, para o "Ver as N" da lista. */
  itens?: PrazoDaAgenda[];
};

/** O prazo como sai de cada busca, antes de juntar. */
export type PrazoBruto = Omit<PrazoDaAgenda, "quantos" | "fonte" | "itens"> & {
  centavos?: number;
  /**
   * Junta só com quem tem o mesmo `grupo` no dia: as obrigações pelo modelo
   * ("DCTFWeb · 6 empresas") e as guias pelo tipo. Sem `grupo`, junta pelo tipo.
   */
  grupo?: string;
};

export const ROTULO_DO_PRAZO: Record<TipoDePrazo, { um: string; varios: string }> = {
  tech: { um: "item do controle interno", varios: "itens do controle interno" },
  tarefa: { um: "atividade", varios: "atividades" },
  "conta-pagar": { um: "conta a pagar", varios: "contas a pagar" },
  "conta-receber": { um: "conta a receber", varios: "contas a receber" },
  pendencia: { um: "pendência com o cliente", varios: "pendências com o cliente" },
  processo: { um: "processo com prazo combinado", varios: "processos com prazo combinado" },
  exigencia: { um: "exigência do órgão", varios: "exigências do órgão" },
  taxa: { um: "taxa do Societário", varios: "taxas do Societário" },
  licenca: { um: "licença vencendo", varios: "licenças vencendo" },
  ferias: { um: "férias começando", varios: "férias começando" },
  exame: { um: "exame admissional", varios: "exames admissionais" },
  vaga: { um: "inscrição encerrando", varios: "inscrições encerrando" },
  certificado: { um: "certificado vencendo", varios: "certificados vencendo" },
  obrigacao: { um: "obrigação", varios: "obrigações" },
  guia: { um: "guia", varios: "guias" },
};

/** Para onde leva a entrada que junta vários prazos do mesmo tipo. */
export const TELA_DO_TIPO: Record<TipoDePrazo, string> = {
  tech: ROTA_TECH_INTERNO,
  tarefa: "/tarefas",
  "conta-pagar": "/pagar",
  "conta-receber": "/receber",
  pendencia: "/pendencias",
  processo: "/processos",
  exigencia: "/exigencias",
  taxa: "/processos",
  licenca: "/licencas",
  ferias: "/ferias",
  exame: "/admissoes",
  vaga: "/vagas",
  certificado: "/certificados?aba=renovar",
  obrigacao: "/kanban",
  guia: "/autorizacoes/guias",
};

const MOEDA_CURTA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "DD/MM" de uma data "AAAA-MM-DD". */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** O prazo já com a fonte e sem os campos de trabalho. */
function finalizar(p: PrazoBruto): PrazoDaAgenda {
  return {
    chave: p.chave,
    dia: p.dia,
    tipo: p.tipo,
    fonte: fonteDoTipo(p.tipo),
    titulo: p.titulo,
    detalhe: p.detalhe,
    setor: p.setor,
    href: p.href,
    quantos: 1,
    ...(p.atrasada ? { atrasada: true } : {}),
    ...(p.riscoDeMulta ? { riscoDeMulta: true } : {}),
  };
}

/**
 * Junta os prazos do mesmo tipo (e do mesmo `grupo`) no mesmo dia quando passam
 * de `limite`: dez tarefas vencendo na sexta viram "10 atividades", seis
 * DCTFWeb no mesmo dia viram "DCTFWeb · 6 empresas". Conta a pagar e a receber
 * juntam sempre — uma célula com trinta boletos não se lê — e sem os itens: um
 * boleto não tem título que diga algo, o caminho é a tela das contas. O valor
 * em reais, quando há, vai somado no detalhe. A entrada que junta leva os itens
 * (o "Ver as N" da lista de Prazos), é atrasada se todos estão e tem risco de
 * multa se algum tem.
 */
export function agruparPrazos(prazos: PrazoBruto[], limite = 2): PrazoDaAgenda[] {
  const grupos = new Map<string, PrazoBruto[]>();
  for (const p of prazos) {
    const k = `${p.dia}|${p.tipo}|${p.setor}|${p.grupo ?? ""}`;
    const lista = grupos.get(k) ?? [];
    lista.push(p);
    grupos.set(k, lista);
  }
  const saida: PrazoDaAgenda[] = [];
  for (const lista of grupos.values()) {
    const { tipo, dia, setor, grupo } = lista[0];
    const sempreJunta = tipo === "conta-pagar" || tipo === "conta-receber";
    if (!sempreJunta && lista.length <= limite) {
      for (const p of lista) saida.push(finalizar(p));
      continue;
    }
    const n = lista.length;
    const soma = lista.reduce((s, p) => s + (p.centavos ?? 0), 0);
    const valor = soma > 0 ? MOEDA_CURTA.format(soma / 100) : undefined;
    const r = ROTULO_DO_PRAZO[tipo];
    const atrasada = lista.every((p) => p.atrasada);
    const risco = lista.some((p) => p.riscoDeMulta);
    saida.push({
      chave: `${dia}-${tipo}-${setor}${grupo ? `-${grupo}` : ""}`,
      dia,
      tipo,
      fonte: fonteDoTipo(tipo),
      setor,
      titulo: grupo ?? `${n} ${n === 1 ? r.um : r.varios}`,
      detalhe: grupo ? [`${n} empresas`, valor].filter(Boolean).join(" · ") : valor,
      href: TELA_DO_TIPO[tipo],
      quantos: n,
      ...(atrasada ? { atrasada: true } : {}),
      ...(risco ? { riscoDeMulta: true } : {}),
      ...(sempreJunta ? {} : { itens: lista.map(finalizar).sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")) }),
    });
  }
  return saida.sort((a, b) => a.dia.localeCompare(b.dia) || a.tipo.localeCompare(b.tipo) || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

/** O dia passou e o tipo é dos que atrasam. `hoje` e `dia` em "AAAA-MM-DD". */
export function estaAtrasado(tipo: TipoDePrazo, dia: string, hoje: string): boolean {
  return tipoAtrasa(tipo) && dia < hoje;
}

// ─── Obrigações: a data legal ───────────────────────────────────────────────

export type ObrigacaoParaAgenda = {
  id: string;
  /** "AAAA-MM-DD", já no dia útil. */
  dataLegal: string;
  /** "AAAA-MM-DD": o vencimento da atividade no quadro. */
  prazoInterno: string;
  modelo: string;
  setor: string;
  empresa: string;
  /** A atividade do quadro: é ela que se abre, e é o escopo dela que decide quem vê. */
  pipelineId: string;
  itemId: string;
  /** O número da atividade: o link vai pelo endereço curto, tarefa-77 (10/11/2026). */
  itemNumero?: number;
};

/**
 * A obrigação na Agenda: no dia da DATA LEGAL, e não no prazo interno — esse
 * já vem como a atividade do quadro (fonte Tarefas). Leva o selo de risco de
 * multa pela mesma régua do aviso da Gestão (`riscoDeMulta`, dias úteis com os
 * feriados do escritório), e o de atrasada quando a data legal passou.
 */
export function prazoDaObrigacao(o: ObrigacaoParaAgenda, hoje: string, feriados: Feriados): PrazoBruto {
  return {
    chave: `obrigacao-${o.id}`,
    dia: o.dataLegal,
    tipo: "obrigacao",
    titulo: o.modelo,
    detalhe: [o.empresa, `prazo interno ${diaMes(o.prazoInterno)}`].join(" · "),
    setor: o.setor,
    href: enderecoDaTarefa(o.pipelineId, { id: o.itemId, number: o.itemNumero }),
    grupo: o.modelo,
    atrasada: estaAtrasado("obrigacao", o.dataLegal, hoje),
    riscoDeMulta: riscoDeMulta(o.dataLegal, hoje, feriados) !== null,
  };
}

// ─── Guias emitidas pelo Connect ────────────────────────────────────────────

export type GuiaParaAgenda = {
  id: string;
  descricao: string;
  /** "AAAA-MM-DD" ou nulo (a DCTFWeb e a parcela não devolvem). */
  vencimento: string | null;
  /** "AAAA-MM-DD": até quando o banco aceita a guia com este cálculo. */
  validoAte: string | null;
  centavos: number | null;
  empresa: string;
  setor: string;
};

/**
 * A guia ainda não paga, no dia do vencimento (sem ele, no "válido até"). É
 * atrasada pela mesma regra da situação "Vencida" da tela de Guias
 * (src/lib/guias/situacao.ts): passou o último dia que o banco aceita. Guia
 * sem data nenhuma não tem dia na Agenda: `null`.
 */
export function prazoDaGuia(g: GuiaParaAgenda, hoje: string): PrazoBruto | null {
  const dia = g.vencimento ?? g.validoAte;
  if (!dia) return null;
  const limite = g.validoAte ?? g.vencimento ?? dia;
  return {
    chave: `guia-${g.id}`,
    dia,
    tipo: "guia",
    titulo: g.descricao,
    detalhe: [g.empresa, g.centavos != null ? MOEDA.format(g.centavos / 100) : null].filter(Boolean).join(" · "),
    setor: g.setor,
    href: `/autorizacoes/guias?mes=${dia.slice(0, 7)}`,
    // "DAS do Simples Nacional · 09/2026" junta pelo que vem antes do ponto.
    grupo: g.descricao.split(" · ")[0],
    centavos: g.centavos ?? undefined,
    atrasada: limite < hoje,
  };
}

// ─── A lista de Prazos ──────────────────────────────────────────────────────

export type DiaDaLista = { dia: string; prazos: PrazoDaAgenda[] };

/**
 * A lista de Prazos de `de` a `ate`: os atrasados de antes de `de` num grupo à
 * parte, no alto (só os que atrasam — férias que começaram não entram), e os
 * do período dia a dia. Dia sem prazo não aparece.
 */
export function listaDePrazos(prazos: readonly PrazoDaAgenda[], de: string, ate: string): { atrasados: PrazoDaAgenda[]; dias: DiaDaLista[] } {
  const atrasados = prazos.filter((p) => p.dia < de && p.atrasada).sort((a, b) => a.dia.localeCompare(b.dia));
  const porDia = new Map<string, PrazoDaAgenda[]>();
  for (const p of prazos) {
    if (p.dia < de || p.dia > ate) continue;
    porDia.set(p.dia, [...(porDia.get(p.dia) ?? []), p]);
  }
  const dias = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dia, lista]) => ({ dia, prazos: lista }));
  return { atrasados, dias };
}
