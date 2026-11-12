// Os eventos de saúde e segurança do eSocial no DP 2 (12/11/2026, fase 3c):
// monitoramento da saúde — o ASO (S-2220), condições ambientais (S-2240) e a
// comunicação de acidente — a CAT (S-2210).
//
// Como nas fases anteriores: o XML sem assinatura e as pendências, com o
// lugar de corrigir. Os códigos das tabelas do eSocial (procedimentos,
// agentes nocivos, parte atingida, situação geradora…) quem informa é o DP,
// do PCMSO, do LTCAT ou do atestado; o Connect só confere o formato.
// ⚠️ Montados pelo leiaute S-1.3, sem a validação contra os XSD oficiais.
//
// Puro, sem banco.

import { el } from "./xml";
import { cpfValido, digitos } from "./documentos";
import { AMBIENTE, PROCESSO_DE_EMISSAO, VERSAO_DO_PROCESSO } from "./leiaute";
import { envelope, ideEmpregador, pendenciasDoEmpregador, type EmpregadorEsocial, type EventoGerado, type GeradorDeId, type Pendencia } from "./eventos";

// ─── Responsáveis da empresa ────────────────────────────────────────────────

export type ResponsaveisDeSst = {
  /** Médico responsável pelo PCMSO. */
  medicoNome: string | null;
  medicoCpf: string | null;
  medicoCrm: string | null;
  medicoUf: string | null;
  /** Responsável pelos registros ambientais (LTCAT). */
  ambientalNome: string | null;
  ambientalCpf: string | null;
  /** Órgão de classe: "1" CRM, "4" CREA, "9" outro. */
  ambientalOrgao: string | null;
  ambientalOrgaoNome: string | null;
  ambientalNumero: string | null;
  ambientalUf: string | null;
};

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export function lerResponsaveis(bruto: unknown): ResponsaveisDeSst {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const t = (k: string, max: number) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim().slice(0, max) : null);
  const uf = (k: string) => {
    const v = t(k, 2)?.toUpperCase() ?? null;
    return v && UFS.has(v) ? v : null;
  };
  const orgao = t("ambientalOrgao", 1);
  return {
    medicoNome: t("medicoNome", 70),
    medicoCpf: digitos(t("medicoCpf", 14)) || null,
    medicoCrm: digitos(t("medicoCrm", 10)) || null,
    medicoUf: uf("medicoUf"),
    ambientalNome: t("ambientalNome", 70),
    ambientalCpf: digitos(t("ambientalCpf", 14)) || null,
    ambientalOrgao: orgao && ["1", "4", "9"].includes(orgao) ? orgao : null,
    ambientalOrgaoNome: t("ambientalOrgaoNome", 20),
    ambientalNumero: t("ambientalNumero", 14),
    ambientalUf: uf("ambientalUf"),
  };
}

type Trabalhador = { personId: string; nome: string; cpf: string | null; matricula: string | null };

const ideEvento = () => el("ideEvento", [el("indRetif", "1"), el("tpAmb", AMBIENTE), el("procEmi", PROCESSO_DE_EMISSAO), el("verProc", VERSAO_DO_PROCESSO)]);
const ideVinculo = (t: Trabalhador) => el("ideVinculo", [el("cpfTrab", digitos(t.cpf)), el("matricula", t.matricula)]);
const falta = (onde: Pendencia["onde"], texto: string, link: string | null): Pendencia => ({ onde, texto, link, bloqueia: true });
const CONFIGURACAO = "/dp2/configuracao";

function pendenciasDoVinculo(t: Trabalhador): Pendencia[] {
  const p: Pendencia[] = [];
  if (!cpfValido(t.cpf)) p.push(falta("colaborador", `${t.nome}: CPF inválido ou ausente.`, `/pessoas/${t.personId}`));
  if (!t.matricula) p.push(falta("colaborador", `${t.nome}: informe a matrícula do eSocial no contrato.`, `/dp2/colaboradores?pessoa=${t.personId}`));
  return p;
}

const data = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const hora = (v: string | null | undefined) => {
  const d = digitos(v);
  return d.length === 4 && Number(d.slice(0, 2)) < 24 && Number(d.slice(2)) < 60 ? d : null;
};

// ─── S-2220 Monitoramento da saúde (ASO) ────────────────────────────────────

export const TIPOS_DE_EXAME: [string, string][] = [
  ["0", "Admissional"],
  ["1", "Periódico"],
  ["2", "Retorno ao trabalho"],
  ["3", "Mudança de função ou de risco"],
  ["4", "Monitoração pontual"],
  ["9", "Demissional"],
];

export type Aso = {
  tipoExame: string;
  data: string | null;
  /** "1" apto, "2" inapto. */
  resultado: string;
  /** Códigos da Tabela 27 dos procedimentos feitos (o exame clínico e os complementares). */
  procedimentos: string[];
  medicoNome: string | null;
  medicoCrm: string | null;
  medicoUf: string | null;
};

/** "0295, 0693" → ["0295", "0693"]: códigos de 4 dígitos. */
export function lerProcedimentos(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).map((c) => digitos(c)).filter((c) => c.length === 4))];
}

export function eventoS2220(e: EmpregadorEsocial, t: Trabalhador, aso: Aso, resp: ResponsaveisDeSst, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t)];
  if (!TIPOS_DE_EXAME.some(([k]) => k === aso.tipoExame)) pendencias.push(falta("colaborador", "Escolha o tipo do exame.", null));
  if (!data(aso.data)) pendencias.push(falta("colaborador", "Informe a data do ASO.", null));
  if (aso.procedimentos.length === 0) pendencias.push(falta("colaborador", "Informe ao menos um procedimento do ASO (código da Tabela 27, 4 dígitos).", null));
  if (!aso.medicoNome || !aso.medicoCrm || !aso.medicoUf) pendencias.push(falta("colaborador", "Informe nome, CRM e UF do médico que assinou o ASO.", null));
  if (!resp.medicoNome || !resp.medicoCrm || !resp.medicoUf) {
    pendencias.push(falta("empresa", "Informe o médico responsável pelo PCMSO em Configuração da empresa.", CONFIGURACAO));
  }
  const id = novoId();
  const xml = envelope("S-2220", id, [
    ideEvento(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("exMedOcup", [
      el("tpExameOcup", aso.tipoExame),
      el("aso", [
        el("dtAso", data(aso.data)),
        el("resAso", aso.resultado === "2" ? "2" : "1"),
        ...aso.procedimentos.map((c, i) => el("exame", [el("dtExm", data(aso.data)), el("procRealizado", c), el("ordExame", i === 0 ? "1" : "2")])),
        el("medico", [el("nmMed", aso.medicoNome), el("nrCRM", aso.medicoCrm), el("ufCRM", aso.medicoUf)]),
      ]),
      el("respMonit", [el("cpfResp", resp.medicoCpf), el("nmResp", resp.medicoNome), el("nrCRM", resp.medicoCrm), el("ufCRM", resp.medicoUf)]),
    ]),
  ]);
  return { tipo: "S-2220", referencia: `${digitos(t.cpf) || t.nome} · ${aso.data ?? "sem data"}`, personId: t.personId, idEvento: id, xml, pendencias };
}

// ─── S-2240 Condições ambientais ────────────────────────────────────────────

/** Tabela 24: "ausência de agente nocivo ou de atividades previstas no Anexo IV do Decreto 3.048/1999". */
export const SEM_AGENTE_NOCIVO = "09.01.001";

export type CondicaoAmbiental = {
  inicio: string | null;
  setor: string | null;
  atividade: string | null;
  /** Códigos da Tabela 24 ("01.18.001"); vazio = sem agente nocivo. */
  agentes: string[];
  /** EPC e EPI: "0" não se aplica, "1" não implementa/utiliza, "2" implementa/utiliza. */
  usaEpc: string;
  usaEpi: string;
};

export function lerAgentes(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).map((c) => c.trim()).filter((c) => /^\d{2}\.\d{2}\.\d{3}$/.test(c)))];
}

export function eventoS2240(e: EmpregadorEsocial, t: Trabalhador, c: CondicaoAmbiental, resp: ResponsaveisDeSst, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t)];
  if (!data(c.inicio)) pendencias.push(falta("colaborador", "Informe desde quando vale a condição ambiental.", null));
  if (!c.setor) pendencias.push(falta("colaborador", "Informe o setor (lugar onde a pessoa trabalha).", null));
  if (!c.atividade) pendencias.push(falta("colaborador", "Descreva a atividade da pessoa.", null));
  if (!resp.ambientalNome || !cpfValido(resp.ambientalCpf) || !resp.ambientalOrgao || !resp.ambientalNumero) {
    pendencias.push(falta("empresa", "Informe o responsável pelos registros ambientais (nome, CPF, órgão de classe e número) em Configuração da empresa.", CONFIGURACAO));
  }
  const agentes = c.agentes.filter((a) => a !== SEM_AGENTE_NOCIVO);
  if (agentes.length > 0) {
    pendencias.push({
      onde: "colaborador",
      texto: `${t.nome}: com agente nocivo, confira no LTCAT a avaliação (intensidade, limite de tolerância) e o EPI antes do envio.`,
      link: null,
      bloqueia: false,
    });
  }
  const id = novoId();
  const blocoDoAgente = (codigo: string) =>
    codigo === SEM_AGENTE_NOCIVO
      ? el("agNoc", [el("codAgNoc", SEM_AGENTE_NOCIVO)])
      : el("agNoc", [el("codAgNoc", codigo), el("tpAval", "2"), el("epcEpi", [el("utilizEPC", c.usaEpc), el("utilizEPI", c.usaEpi)])]);
  const xml = envelope("S-2240", id, [
    ideEvento(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("infoExpRisco", [
      el("dtIniCondicao", data(c.inicio)),
      el("infoAmb", [el("localAmb", "1"), el("dscSetor", c.setor?.slice(0, 100)), el("tpInsc", "1"), el("nrInsc", digitos(e.cnpj))]),
      el("infoAtiv", [el("dscAtivDes", c.atividade?.slice(0, 999))]),
      ...(agentes.length ? agentes : [SEM_AGENTE_NOCIVO]).map(blocoDoAgente),
      el("respReg", [
        el("cpfResp", resp.ambientalCpf),
        el("ideOC", resp.ambientalOrgao),
        el("dscOC", resp.ambientalOrgao === "9" ? resp.ambientalOrgaoNome : null),
        el("nrOC", resp.ambientalNumero),
        el("ufOC", resp.ambientalUf),
      ]),
    ]),
  ]);
  return { tipo: "S-2240", referencia: `${digitos(t.cpf) || t.nome} · ${c.inicio ?? "sem data"}`, personId: t.personId, idEvento: id, xml, pendencias };
}

// ─── S-2210 Comunicação de acidente de trabalho (CAT) ───────────────────────

export const TIPOS_DE_ACIDENTE: [string, string][] = [
  ["1", "Típico"],
  ["2", "Doença"],
  ["3", "Trajeto"],
];

export const LATERALIDADES: [string, string][] = [
  ["0", "Não aplicável"],
  ["1", "Esquerda"],
  ["2", "Direita"],
  ["3", "Ambas"],
];

export type Cat = {
  dataAcidente: string | null;
  /** "HHMM" ou "HH:MM". */
  horaAcidente: string | null;
  horasTrabalhadasAntes: string | null;
  tipoAcidente: string;
  obito: boolean;
  comunicouPolicia: boolean;
  /** Tabela 15, 9 dígitos. */
  situacaoGeradora: string | null;
  ultimoDiaTrabalhado: string | null;
  houveAfastamento: boolean;
  localDescricao: string | null;
  localLogradouro: string | null;
  localNumero: string | null;
  localCep: string | null;
  localMunicipio: string | null;
  localUf: string | null;
  /** Tabela 13, 9 dígitos. */
  parteAtingida: string | null;
  lateralidade: string;
  /** Tabela 14 ou 15, 9 dígitos. */
  agenteCausador: string | null;
  // Atestado
  dataAtendimento: string | null;
  horaAtendimento: string | null;
  internacao: boolean;
  diasDeTratamento: number | null;
  /** Tabela 17, 9 dígitos. */
  naturezaDaLesao: string | null;
  cid: string | null;
  emitenteNome: string | null;
  emitenteCrm: string | null;
  emitenteUf: string | null;
  observacao: string | null;
};

const codigo9 = (v: string | null) => {
  const d = digitos(v);
  return d.length === 9 ? d : null;
};

export function eventoS2210(e: EmpregadorEsocial, t: Trabalhador, c: Cat, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t)];
  const exigir = (ok: unknown, texto: string) => {
    if (!ok) pendencias.push(falta("colaborador", texto, null));
  };
  exigir(data(c.dataAcidente), "Informe a data do acidente.");
  exigir(hora(c.horaAcidente) || c.tipoAcidente === "2", "Informe a hora do acidente.");
  exigir(TIPOS_DE_ACIDENTE.some(([k]) => k === c.tipoAcidente), "Escolha o tipo do acidente.");
  exigir(codigo9(c.situacaoGeradora), "Informe a situação geradora (Tabela 15, 9 dígitos).");
  exigir(data(c.ultimoDiaTrabalhado), "Informe o último dia trabalhado.");
  exigir(c.localLogradouro && digitos(c.localCep).length === 8 && digitos(c.localMunicipio).length === 7 && c.localUf, "Informe o local do acidente: logradouro, CEP, município (IBGE) e UF.");
  exigir(codigo9(c.parteAtingida), "Informe a parte do corpo atingida (Tabela 13, 9 dígitos).");
  exigir(codigo9(c.agenteCausador), "Informe o agente causador (Tabela 14 ou 15, 9 dígitos).");
  exigir(data(c.dataAtendimento) && hora(c.horaAtendimento), "Informe a data e a hora do atendimento médico.");
  exigir(codigo9(c.naturezaDaLesao), "Informe a natureza da lesão (Tabela 17, 9 dígitos).");
  exigir(/^[A-Z]\d{2,3}$/.test((c.cid ?? "").replace(/\W/g, "").toUpperCase()), "Informe o CID (ex.: S61.0).");
  exigir(c.emitenteNome && digitos(c.emitenteCrm) && c.emitenteUf, "Informe o médico do atendimento (nome, CRM e UF).");

  const id = novoId();
  const xml = envelope("S-2210", id, [
    ideEvento(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("cat", [
      el("dtAcid", data(c.dataAcidente)),
      el("tpAcid", c.tipoAcidente),
      el("hrAcid", hora(c.horaAcidente)),
      el("hrsTrabAntesAcid", hora(c.horasTrabalhadasAntes)),
      el("tpCat", "1"),
      el("indCatObito", c.obito ? "S" : "N"),
      el("indComunPolicia", c.comunicouPolicia ? "S" : "N"),
      el("codSitGeradora", codigo9(c.situacaoGeradora)),
      el("iniciatCAT", "1"),
      el("obsCAT", c.observacao?.slice(0, 999)),
      el("ultDiaTrab", data(c.ultimoDiaTrabalhado)),
      el("houveAfast", c.houveAfastamento ? "S" : "N"),
      el("localAcidente", [
        el("tpLocal", "1"),
        el("dscLocal", c.localDescricao?.slice(0, 255)),
        el("dscLograd", c.localLogradouro?.slice(0, 100)),
        el("nrLograd", (c.localNumero || "S/N").slice(0, 10)),
        el("cep", digitos(c.localCep) || null),
        el("codMunic", digitos(c.localMunicipio) || null),
        el("uf", c.localUf),
        el("ideLocalAcid", [el("tpInsc", "1"), el("nrInsc", digitos(e.cnpj))]),
      ]),
      el("parteAtingida", [el("codParteAting", codigo9(c.parteAtingida)), el("lateralidade", c.lateralidade)]),
      el("agenteCausador", [el("codAgntCausador", codigo9(c.agenteCausador))]),
      el("atestado", [
        el("dtAtendimento", data(c.dataAtendimento)),
        el("hrAtendimento", hora(c.horaAtendimento)),
        el("indInternacao", c.internacao ? "S" : "N"),
        el("durTrat", String(Math.max(0, Math.round(c.diasDeTratamento ?? 0)))),
        el("indAfast", c.houveAfastamento ? "S" : "N"),
        el("dscLesao", codigo9(c.naturezaDaLesao)),
        el("codCID", (c.cid ?? "").replace(/\W/g, "").toUpperCase() || null),
        el("emitente", [el("nmEmit", c.emitenteNome?.slice(0, 70)), el("ideOC", "1"), el("nrOC", digitos(c.emitenteCrm) || null), el("ufOC", c.emitenteUf)]),
      ]),
    ]),
  ]);
  return { tipo: "S-2210", referencia: `${digitos(t.cpf) || t.nome} · ${c.dataAcidente ?? "sem data"}`, personId: t.personId, idEvento: id, xml, pendencias };
}
