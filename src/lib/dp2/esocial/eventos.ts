// Os eventos do eSocial que o DP 2 gera (12/11/2026, fase 3a): tabelas
// (S-1000, S-1005, S-1010, S-1020) e periódicos (S-1200, S-1210, S-1299).
//
// Cada gerador devolve o XML do evento (sem assinatura) e as pendências: o que
// falta no cadastro para o evento passar no eSocial, em português e com o
// lugar onde se corrige. Pendência que "bloqueia" deixa o evento fora do lote;
// a de "conferir" é um código que o Connect sugeriu e o DP deve confirmar.
//
// ⚠️ Os eventos seguem o leiaute S-1.3 de memória do manual, sem a validação
// contra os XSD oficiais (que entra junto com o envio). Antes do primeiro
// envio, cada evento deve passar pelo validador do XSD e pela produção
// restrita.
//
// Puro, sem banco.

import { el, serializar, decimal, type No } from "./xml";
import { cnaeDoEsocial, cnpjValido, cpfValido, digitos, idDoEvento, raizDoCnpj } from "./documentos";
import {
  AMBIENTE,
  LOTACAO_PADRAO,
  PROCESSO_DE_EMISSAO,
  TABELA_DE_RUBRICAS,
  TAG_DO_EVENTO,
  VERSAO_DO_PROCESSO,
  namespaceDoEvento,
  type TipoDeEvento,
} from "./leiaute";

export type Pendencia = { onde: "empresa" | "colaborador" | "rubrica" | "competencia"; texto: string; link: string | null; bloqueia: boolean };

export type EventoGerado = {
  tipo: TipoDeEvento;
  /** O que o evento descreve: "2026-11", o código da rubrica, o CPF… */
  referencia: string;
  personId: string | null;
  idEvento: string;
  xml: string;
  pendencias: Pendencia[];
};

export type EmpregadorEsocial = {
  cnpj: string;
  nome: string;
  /** Classificação tributária (Tabela 8), já resolvida, ou nula. */
  classTrib: string | null;
  cnae: string | null;
  ratAliquota: number;
  fap: number;
  fpas: string | null;
  codTercs: string | null;
  /** "AAAA-MM": desde quando as tabelas valem. */
  iniValid: string;
};

export type RubricaEsocial = {
  codigo: string;
  nome: string;
  tipo: "PROVENTO" | "DESCONTO" | "INFORMATIVA";
  papel: string | null;
  incideInss: boolean;
  incideFgts: boolean;
  incideIrrf: boolean;
  naturezaEsocial: string | null;
  codIncCP: string | null;
  codIncIRRF: string | null;
  codIncFGTS: string | null;
};

export type ItemDaRemuneracao = { codigo: string; tipo: string; referencia: string; valor: number; quantidade: number | null };

export type TrabalhadorEsocial = { personId: string; nome: string; cpf: string | null; matricula: string | null; categoria: string; itens: ItemDaRemuneracao[]; liquido: number };

/** Gera o Id e o carimbo de um evento; o sequencial evita Id repetido no mesmo segundo. */
export type GeradorDeId = () => string;

export function geradorDeId(cnpj: string, quando: Date): GeradorDeId {
  let seq = 0;
  return () => idDoEvento(cnpj, quando, ++seq);
}

// ─── Classificação tributária e incidências ─────────────────────────────────

/**
 * Tabela 8: 01 Simples com a contribuição patronal substituída (anexos I a
 * III e V), 02 Simples sem substituição (anexo IV), 04 MEI, 99 demais pessoas
 * jurídicas. O resto (imunes, produtor rural, doméstico) o DP informa.
 */
export function classificacaoTributaria(regime: string | null, patronalNoDas: boolean, informada: string | null): string | null {
  if (informada && /^\d{2}$/.test(informada)) return informada;
  switch (regime) {
    case "SIMPLES_NACIONAL":
      return patronalNoDas ? "01" : "02";
    case "MEI":
      return "04";
    case "LUCRO_PRESUMIDO":
    case "LUCRO_REAL":
      return "99";
    default:
      return null;
  }
}

/**
 * Os códigos de incidência da rubrica (Tabelas 21 a 23 do leiaute), sugeridos
 * pelo papel e pelas incidências do DP 2 quando o escritório não informou.
 * `conferir` lista os campos sugeridos sem certeza.
 */
export function incidencias(r: RubricaEsocial): { cp: string; irrf: string; fgts: string; conferir: string[] } {
  const conferir: string[] = [];
  const decimo = r.papel === "DECIMO_PRIMEIRA" || r.papel === "DECIMO_SEGUNDA" || r.papel === "DECIMO_ADIANTADO";
  let cp = r.incideInss ? (decimo ? "12" : "11") : "00";
  if (r.papel === "INSS") cp = "31";
  if (r.papel === "INSS_DECIMO") cp = "32";
  if (r.papel === "SALARIO_FAMILIA") cp = "51";
  let irrf = r.incideIrrf ? (decimo ? "12" : "11") : "00";
  if (r.papel === "IRRF") irrf = "31";
  if (r.papel === "IRRF_DECIMO") irrf = "32";
  if (r.papel === "INSS" || r.papel === "INSS_DECIMO" || r.papel === "PENSAO" || r.papel === "SALARIO_FAMILIA" || (!r.papel && !r.incideIrrf)) {
    conferir.push("IRRF");
  }
  const fgts = r.incideFgts ? (decimo ? "12" : "11") : "00";
  return {
    cp: r.codIncCP ?? cp,
    irrf: r.codIncIRRF ?? irrf,
    fgts: r.codIncFGTS ?? fgts,
    conferir: conferir.filter((c) => (c === "IRRF" ? !r.codIncIRRF : true)),
  };
}

const TIPO_DA_RUBRICA: Record<RubricaEsocial["tipo"], string> = { PROVENTO: "1", DESCONTO: "2", INFORMATIVA: "3" };

// ─── Montagem comum ─────────────────────────────────────────────────────────

function ideEmpregador(cnpj: string): No | null {
  return el("ideEmpregador", [el("tpInsc", "1"), el("nrInsc", raizDoCnpj(cnpj))]);
}

function ideEventoDeTabela(): No | null {
  return el("ideEvento", [el("tpAmb", AMBIENTE), el("procEmi", PROCESSO_DE_EMISSAO), el("verProc", VERSAO_DO_PROCESSO)]);
}

function envelope(tipo: TipoDeEvento, id: string, corpo: (No | null)[]): string {
  return serializar(el("eSocial", [el(TAG_DO_EVENTO[tipo], corpo, { Id: id })], { xmlns: namespaceDoEvento(tipo) }));
}

function pendenciasDoEmpregador(e: EmpregadorEsocial): Pendencia[] {
  const p: Pendencia[] = [];
  if (!cnpjValido(e.cnpj)) p.push({ onde: "empresa", texto: "CNPJ da empresa inválido ou ausente no cadastro.", link: null, bloqueia: true });
  return p;
}

// ─── Tabelas ────────────────────────────────────────────────────────────────

export function eventoS1000(e: EmpregadorEsocial, novoId: GeradorDeId): EventoGerado {
  const pendencias = pendenciasDoEmpregador(e);
  if (!e.classTrib) {
    pendencias.push({ onde: "empresa", texto: "Classificação tributária não identificada pelo regime: informe em Configuração da empresa.", link: "/dp2/configuracao", bloqueia: true });
  }
  const id = novoId();
  const xml = envelope("S-1000", id, [
    ideEventoDeTabela(),
    ideEmpregador(e.cnpj),
    el("infoEmpregador", [
      el("inclusao", [
        el("idePeriodo", [el("iniValid", e.iniValid)]),
        el("infoCadastro", [el("classTrib", e.classTrib), el("indDesFolha", "0"), el("indOptRegEletron", "1")]),
      ]),
    ]),
  ]);
  return { tipo: "S-1000", referencia: e.iniValid, personId: null, idEvento: id, xml, pendencias };
}

export function eventoS1005(e: EmpregadorEsocial, novoId: GeradorDeId): EventoGerado {
  const pendencias = pendenciasDoEmpregador(e);
  const cnae = cnaeDoEsocial(e.cnae);
  if (!cnae) pendencias.push({ onde: "empresa", texto: "CNAE principal com 7 dígitos ausente no cadastro da empresa.", link: null, bloqueia: true });
  const id = novoId();
  const xml = envelope("S-1005", id, [
    ideEventoDeTabela(),
    ideEmpregador(e.cnpj),
    el("infoEstab", [
      el("inclusao", [
        el("ideEstab", [el("tpInsc", "1"), el("nrInsc", digitos(e.cnpj)), el("iniValid", e.iniValid)]),
        el("dadosEstab", [el("cnaePrep", cnae), el("aliqGilrat", [el("aliqRat", String(Math.round(e.ratAliquota))), el("fap", decimal(e.fap, 4))])]),
      ]),
    ]),
  ]);
  return { tipo: "S-1005", referencia: digitos(e.cnpj), personId: null, idEvento: id, xml, pendencias };
}

export function eventoS1020(e: EmpregadorEsocial, novoId: GeradorDeId): EventoGerado {
  const pendencias = pendenciasDoEmpregador(e);
  if (!/^\d{3}$/.test(e.fpas ?? "")) pendencias.push({ onde: "empresa", texto: "Código FPAS (3 dígitos) ausente: informe em Configuração da empresa.", link: "/dp2/configuracao", bloqueia: true });
  if (!/^\d{4}$/.test(e.codTercs ?? "")) pendencias.push({ onde: "empresa", texto: "Código de terceiros (4 dígitos) ausente: informe em Configuração da empresa.", link: "/dp2/configuracao", bloqueia: true });
  const id = novoId();
  const xml = envelope("S-1020", id, [
    ideEventoDeTabela(),
    ideEmpregador(e.cnpj),
    el("infoLotacao", [
      el("inclusao", [
        el("ideLotacao", [el("codLotacao", LOTACAO_PADRAO), el("iniValid", e.iniValid)]),
        el("dadosLotacao", [el("tpLotacao", "01"), el("fpasLotacao", [el("fpas", e.fpas), el("codTercs", e.codTercs)])]),
      ]),
    ]),
  ]);
  return { tipo: "S-1020", referencia: LOTACAO_PADRAO, personId: null, idEvento: id, xml, pendencias };
}

export function eventoS1010(e: EmpregadorEsocial, r: RubricaEsocial, novoId: GeradorDeId): EventoGerado {
  const pendencias = pendenciasDoEmpregador(e);
  const linkDaRubrica = "/dp2/rubricas";
  if (!/^\d{4}$/.test(r.naturezaEsocial ?? "")) {
    pendencias.push({ onde: "rubrica", texto: `Rubrica ${r.codigo} · ${r.nome}: informe a natureza (Tabela 3 do eSocial, 4 dígitos).`, link: linkDaRubrica, bloqueia: true });
  }
  const inc = incidencias(r);
  for (const c of inc.conferir) {
    pendencias.push({ onde: "rubrica", texto: `Rubrica ${r.codigo} · ${r.nome}: confira o código de incidência de ${c} sugerido.`, link: linkDaRubrica, bloqueia: false });
  }
  const id = novoId();
  const xml = envelope("S-1010", id, [
    ideEventoDeTabela(),
    ideEmpregador(e.cnpj),
    el("infoRubrica", [
      el("inclusao", [
        el("ideRubrica", [el("codRubr", r.codigo), el("ideTabRubr", TABELA_DE_RUBRICAS), el("iniValid", e.iniValid)]),
        el("dadosRubrica", [
          el("dscRubr", r.nome.slice(0, 100)),
          el("natRubr", r.naturezaEsocial),
          el("tpRubr", TIPO_DA_RUBRICA[r.tipo]),
          el("codIncCP", inc.cp),
          el("codIncIRRF", inc.irrf),
          el("codIncFGTS", inc.fgts),
        ]),
      ]),
    ]),
  ]);
  return { tipo: "S-1010", referencia: r.codigo, personId: null, idEvento: id, xml, pendencias };
}

// ─── Periódicos ─────────────────────────────────────────────────────────────

/** O identificador do demonstrativo do mês, que liga o S-1200 ao S-1210. */
export function ideDmDev(perApur: string): string {
  return `FOLHA${perApur.replace("-", "")}`;
}

function pendenciasDoTrabalhador(t: TrabalhadorEsocial): Pendencia[] {
  const link = `/dp2/colaboradores?pessoa=${t.personId}`;
  const p: Pendencia[] = [];
  if (!cpfValido(t.cpf)) p.push({ onde: "colaborador", texto: `${t.nome}: CPF inválido ou ausente.`, link, bloqueia: true });
  if (!t.matricula) p.push({ onde: "colaborador", texto: `${t.nome}: informe a matrícula do eSocial no contrato.`, link, bloqueia: true });
  return p;
}

export function eventoS1200(e: EmpregadorEsocial, perApur: string, t: TrabalhadorEsocial, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoTrabalhador(t)];
  // Uma linha por rubrica: horas extras lançadas pelo DP e informadas pelo
  // cliente são a mesma rubrica no demonstrativo, com quantidade e valor somados.
  const porRubrica = new Map<string, ItemDaRemuneracao>();
  for (const i of t.itens) {
    if (!(i.valor > 0)) continue;
    const atual = porRubrica.get(i.codigo);
    if (!atual) porRubrica.set(i.codigo, { ...i });
    else {
      atual.valor = Math.round((atual.valor + i.valor) * 100) / 100;
      atual.quantidade = atual.quantidade !== null && i.quantidade !== null ? Math.round((atual.quantidade + i.quantidade) * 100) / 100 : null;
    }
  }
  const itens = [...porRubrica.values()];
  if (itens.length === 0) pendencias.push({ onde: "competencia", texto: `${t.nome}: sem rubricas com valor no mês.`, link: null, bloqueia: true });
  const id = novoId();
  const xml = envelope("S-1200", id, [
    el("ideEvento", [
      el("indRetif", "1"),
      el("indApuracao", "1"),
      el("perApur", perApur),
      el("tpAmb", AMBIENTE),
      el("procEmi", PROCESSO_DE_EMISSAO),
      el("verProc", VERSAO_DO_PROCESSO),
    ]),
    ideEmpregador(e.cnpj),
    el("ideTrabalhador", [el("cpfTrab", digitos(t.cpf))]),
    el("dmDev", [
      el("ideDmDev", ideDmDev(perApur)),
      el("codCateg", t.categoria),
      el("infoPerApur", [
        el("ideEstabLot", [
          el("tpInsc", "1"),
          el("nrInsc", digitos(e.cnpj)),
          el("codLotacao", LOTACAO_PADRAO),
          el("remunPerApur", [
            el("matricula", t.matricula),
            ...itens.map((i) =>
              el("itensRemun", [
                el("codRubr", i.codigo),
                el("ideTabRubr", TABELA_DE_RUBRICAS),
                el("qtdRubr", i.quantidade !== null && i.quantidade > 0 ? decimal(i.quantidade) : null),
                el("vrRubr", decimal(i.valor)),
                el("indApurIR", "0"),
              ])
            ),
          ]),
        ]),
      ]),
    ]),
  ]);
  return { tipo: "S-1200", referencia: `${perApur} · ${digitos(t.cpf) || t.nome}`, personId: t.personId, idEvento: id, xml, pendencias };
}

export function eventoS1210(e: EmpregadorEsocial, perApur: string, dtPgto: string | null, t: TrabalhadorEsocial, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoTrabalhador(t).filter((p) => !p.texto.includes("matrícula"))];
  if (!dtPgto) pendencias.push({ onde: "competencia", texto: "Informe a data do pagamento ao gerar os periódicos.", link: null, bloqueia: true });
  const id = novoId();
  const xml = envelope("S-1210", id, [
    el("ideEvento", [el("indRetif", "1"), el("perApur", perApur), el("tpAmb", AMBIENTE), el("procEmi", PROCESSO_DE_EMISSAO), el("verProc", VERSAO_DO_PROCESSO)]),
    ideEmpregador(e.cnpj),
    el("ideBenef", [
      el("cpfBenef", digitos(t.cpf)),
      el("infoPgto", [el("dtPgto", dtPgto), el("tpPgto", "1"), el("perRef", perApur), el("ideDmDev", ideDmDev(perApur)), el("vrLiq", decimal(t.liquido))]),
    ]),
  ]);
  return { tipo: "S-1210", referencia: `${perApur} · ${digitos(t.cpf) || t.nome}`, personId: t.personId, idEvento: id, xml, pendencias };
}

export function eventoS1299(e: EmpregadorEsocial, perApur: string, comRemuneracao: boolean, novoId: GeradorDeId): EventoGerado {
  const id = novoId();
  const xml = envelope("S-1299", id, [
    el("ideEvento", [el("indApuracao", "1"), el("perApur", perApur), el("tpAmb", AMBIENTE), el("procEmi", PROCESSO_DE_EMISSAO), el("verProc", VERSAO_DO_PROCESSO)]),
    ideEmpregador(e.cnpj),
    el("infoFech", [el("evtRemun", comRemuneracao ? "S" : "N"), el("evtComProd", "N"), el("evtContratAvNP", "N"), el("evtInfoComplPer", "N")]),
  ]);
  return { tipo: "S-1299", referencia: perApur, personId: null, idEvento: id, xml, pendencias: pendenciasDoEmpregador(e) };
}

// ─── Lote (para conferência; o envio assina cada evento antes) ──────────────

/** Os eventos num envelope de lote, para conferir e validar. Não é o arquivo de envio: falta a assinatura. */
export function loteParaConferencia(cnpjEmpregador: string, cnpjTransmissor: string, grupo: "1" | "2" | "3", eventos: readonly { idEvento: string; xml: string }[]): string {
  const corpo =
    `<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1"><envioLoteEventos grupo="${grupo}">` +
    `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raizDoCnpj(cnpjEmpregador)}</nrInsc></ideEmpregador>` +
    `<ideTransmissor><tpInsc>1</tpInsc><nrInsc>${digitos(cnpjTransmissor)}</nrInsc></ideTransmissor>` +
    `<eventos>${eventos.map((e) => `<evento Id="${e.idEvento}">${e.xml}</evento>`).join("")}</eventos>` +
    `</envioLoteEventos></eSocial>`;
  return `<?xml version="1.0" encoding="UTF-8"?>${corpo}`;
}
