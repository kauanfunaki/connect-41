// Os eventos não periódicos do eSocial no DP 2 (12/11/2026, fase 3b):
// admissão (S-2200), alteração contratual (S-2206), afastamento (S-2230) e
// desligamento (S-2299).
//
// Como na fase 3a: o XML sem assinatura e as pendências de cadastro, com o
// lugar onde corrigir. ⚠️ Montados pelo leiaute S-1.3, ainda sem a validação
// contra os XSD oficiais (entra junto com o envio).
//
// Puro, sem banco.

import { el, decimal, type No } from "./xml";
import { cnpjValido, cpfValido, digitos } from "./documentos";
import { AMBIENTE, LOTACAO_PADRAO, PROCESSO_DE_EMISSAO, TABELA_DE_RUBRICAS, VERSAO_DO_PROCESSO } from "./leiaute";
import { envelope, ideEmpregador, pendenciasDoEmpregador, type EmpregadorEsocial, type EventoGerado, type GeradorDeId, type Pendencia } from "./eventos";
import { horasSemanais, type DadosEsocialDoVinculo } from "./cadastro";
import type { MotivoCanonico } from "@/lib/rescisao/motivos";

export type DependenteEsocial = { nome: string; cpf: string | null; nascimento: string | null; tipo: string; irrf: boolean; salarioFamilia: boolean };

export type TrabalhadorCompleto = {
  personId: string;
  nome: string;
  cpf: string | null;
  /** "AAAA-MM-DD". */
  nascimento: string | null;
  endereco: { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cep: string | null; uf: string | null };
  dados: DadosEsocialDoVinculo;
  matricula: string | null;
  categoria: string;
  /** "AAAA-MM-DD". */
  admissao: string | null;
  salario: number;
  tipoSalario: "MENSAL" | "HORISTA";
  horasMensais: number;
  nomeDoCargo: string | null;
  aprendiz: boolean;
  dependentes: DependenteEsocial[];
};

export type SindicatoDoVinculo = { cnpj: string | null; mesDataBase: number | null };

export const ideEventoNaoPeriodico = () =>
  el("ideEvento", [el("indRetif", "1"), el("tpAmb", AMBIENTE), el("procEmi", PROCESSO_DE_EMISSAO), el("verProc", VERSAO_DO_PROCESSO)]);

const ideVinculo = (t: { cpf: string | null; matricula: string | null }) => el("ideVinculo", [el("cpfTrab", digitos(t.cpf)), el("matricula", t.matricula)]);

export const linkDoContrato = (personId: string) => `/dp2/colaboradores?pessoa=${personId}`;
export const linkDoCadastro = (personId: string) => `/pessoas/${personId}`;

export function falta(onde: Pendencia["onde"], texto: string, link: string | null): Pendencia {
  return { onde, texto, link, bloqueia: true };
}

/** O mínimo que todo evento do vínculo precisa: CPF e matrícula. */
function pendenciasDoVinculo(t: { personId: string; nome: string; cpf: string | null; matricula: string | null }): Pendencia[] {
  const p: Pendencia[] = [];
  if (!cpfValido(t.cpf)) p.push(falta("colaborador", `${t.nome}: CPF inválido ou ausente.`, linkDoCadastro(t.personId)));
  if (!t.matricula) p.push(falta("colaborador", `${t.nome}: informe a matrícula do eSocial no contrato.`, linkDoContrato(t.personId)));
  return p;
}

/** O que o contrato precisa para o S-2200 e o S-2206. */
function pendenciasDoContrato(t: TrabalhadorCompleto, sindicato: SindicatoDoVinculo): Pendencia[] {
  const p: Pendencia[] = [];
  const contrato = linkDoContrato(t.personId);
  const d = t.dados;
  if (!d.cbo) p.push(falta("colaborador", `${t.nome}: informe o CBO do cargo (6 dígitos) no contrato.`, contrato));
  if (!t.nomeDoCargo) p.push(falta("colaborador", `${t.nome}: sem cargo no cadastro da pessoa.`, linkDoCadastro(t.personId)));
  if (!d.tipoJornada || !d.descricaoJornada) p.push(falta("colaborador", `${t.nome}: informe o tipo e a descrição da jornada no contrato.`, contrato));
  if (d.tipoContrato !== "1" && !d.dataTermino) p.push(falta("colaborador", `${t.nome}: contrato por prazo determinado sem a data de término.`, contrato));
  if (!(t.salario > 0)) p.push(falta("colaborador", `${t.nome}: salário zerado no contrato.`, contrato));
  if (!cnpjValido(sindicato.cnpj)) {
    p.push(falta("empresa", "Informe o CNPJ do sindicato na convenção coletiva da empresa (vai no vínculo).", "/dp2/convencoes"));
  }
  if (t.aprendiz) p.push({ onde: "colaborador", texto: `${t.nome}: aprendiz — confira os dados do contrato de aprendizagem (entidade qualificadora) antes do envio.`, link: contrato, bloqueia: false });
  return p;
}

function infoCeletista(t: TrabalhadorCompleto, sindicato: SindicatoDoVinculo, comAdmissao: boolean, tpAdmissao = "1"): No | null {
  return el("infoCeletista", [
    comAdmissao ? el("dtAdm", t.admissao) : null,
    comAdmissao ? el("tpAdmissao", tpAdmissao) : null,
    comAdmissao ? el("indAdmissao", "1") : null,
    el("tpRegJor", "1"),
    el("natAtividade", "1"),
    el("dtBase", sindicato.mesDataBase ? String(sindicato.mesDataBase).padStart(2, "0") : null),
    el("cnpjSindCategProf", digitos(sindicato.cnpj)),
  ]);
}

function infoContrato(t: TrabalhadorCompleto, cnpjEstab: string): No | null {
  const d = t.dados;
  return el("infoContrato", [
    el("nmCargo", t.nomeDoCargo?.slice(0, 100)),
    el("CBOCargo", d.cbo),
    el("codCateg", t.categoria),
    el("remuneracao", [el("vrSalFx", decimal(t.salario)), el("undSalFixo", t.tipoSalario === "HORISTA" ? "1" : "5")]),
    el("duracao", [el("tpContr", d.tipoContrato ?? "1"), el("dtTerm", d.tipoContrato === "2" ? d.dataTermino : null)]),
    el("localTrabalho", [el("localTrabGeral", [el("tpInsc", "1"), el("nrInsc", digitos(cnpjEstab))])]),
    el("horContratual", [
      el("qtdHrsSem", decimal(horasSemanais(t.horasMensais))),
      el("tpJornada", d.tipoJornada),
      el("tmpParc", "0"),
      el("horNoturno", "N"),
      el("dscJorn", d.descricaoJornada?.slice(0, 999)),
    ]),
  ]);
}

/** O que todo evento com o cadastro da pessoa (S-2200, S-2300) precisa: nascimento, sexo, endereço… */
export function pendenciasPessoais(t: TrabalhadorCompleto): Pendencia[] {
  const p: Pendencia[] = [];
  const cadastro = linkDoCadastro(t.personId);
  const contrato = linkDoContrato(t.personId);
  const d = t.dados;
  if (!t.nascimento) p.push(falta("colaborador", `${t.nome}: sem data de nascimento no cadastro.`, cadastro));
  if (!d.sexo || !d.racaCor || !d.grauInstrucao) p.push(falta("colaborador", `${t.nome}: informe sexo, raça/cor e grau de instrução no contrato.`, contrato));
  if (!t.endereco.logradouro || digitos(t.endereco.cep).length !== 8 || !t.endereco.uf) {
    p.push(falta("colaborador", `${t.nome}: endereço incompleto no cadastro (logradouro, CEP e UF).`, cadastro));
  }
  if (!d.codigoMunicipio) p.push(falta("colaborador", `${t.nome}: informe o código IBGE do município no contrato.`, contrato));
  for (const dep of t.dependentes) {
    if (!dep.nascimento) p.push(falta("colaborador", `${t.nome}: dependente ${dep.nome} sem data de nascimento.`, cadastro));
    if (dep.irrf && !cpfValido(dep.cpf)) p.push(falta("colaborador", `${t.nome}: dependente ${dep.nome} para o IRRF precisa de CPF.`, cadastro));
  }
  return p;
}

/** O grupo "trabalhador" do S-2200 e do S-2300: identificação, nascimento, endereço e dependentes. */
export function blocoDoTrabalhador(t: TrabalhadorCompleto): No | null {
  return el("trabalhador", [
    el("cpfTrab", digitos(t.cpf)),
    el("nmTrab", t.nome.slice(0, 70)),
    el("sexo", t.dados.sexo),
    el("racaCor", t.dados.racaCor),
    el("estCiv", t.dados.estadoCivil),
    el("grauInstr", t.dados.grauInstrucao),
    el("nascimento", [el("dtNascto", t.nascimento), el("paisNascto", "105"), el("paisNac", "105")]),
    el("endereco", [
      el("brasil", [
        el("dscLograd", t.endereco.logradouro?.slice(0, 100)),
        el("nrLograd", (t.endereco.numero || "S/N").slice(0, 10)),
        el("complemento", t.endereco.complemento?.slice(0, 30)),
        el("bairro", t.endereco.bairro?.slice(0, 90)),
        el("cep", digitos(t.endereco.cep) || null),
        el("codMunic", t.dados.codigoMunicipio),
        el("uf", t.endereco.uf),
      ]),
    ]),
    el("infoDeficiencia", [el("defFisica", "N"), el("defVisual", "N"), el("defAuditiva", "N"), el("defMental", "N"), el("defIntelectual", "N"), el("reabReadap", "N")]),
    ...t.dependentes.map((dep) =>
      el("dependente", [
        el("tpDep", dep.tipo),
        el("nmDep", dep.nome.slice(0, 70)),
        el("dtNascto", dep.nascimento),
        el("cpfDep", digitos(dep.cpf) || null),
        el("depIRRF", dep.irrf ? "S" : "N"),
        el("depSF", dep.salarioFamilia ? "S" : "N"),
        el("incTrab", "N"),
      ])
    ),
  ]);
}

// ─── S-2200 Admissão ────────────────────────────────────────────────────────

/**
 * Sucessão do vínculo (funcionalidade-771): o empregado veio de outra empresa
 * do mesmo grupo sem rescisão. O S-2200 sai com tpAdmissao 2, a admissão da
 * empresa de origem (dtAdm) e o grupo sucessaoVinc com o CNPJ e a matrícula
 * anteriores e a data da transferência.
 */
export type SucessaoDoVinculo = { cnpjAnterior: string | null; matriculaAnterior: string | null; data: string; observacao: string | null };

export function eventoS2200(e: EmpregadorEsocial, t: TrabalhadorCompleto, sindicato: SindicatoDoVinculo, novoId: GeradorDeId, sucessao: SucessaoDoVinculo | null = null): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t), ...pendenciasDoContrato(t, sindicato), ...pendenciasPessoais(t)];
  if (!t.admissao) pendencias.push(falta("colaborador", `${t.nome}: sem data de admissão no cadastro.`, linkDoCadastro(t.personId)));
  if (sucessao) {
    if (digitos(sucessao.cnpjAnterior).length !== 14) pendencias.push(falta("empresa", "A empresa de origem da transferência está sem CNPJ.", null));
    if (!sucessao.matriculaAnterior) pendencias.push(falta("colaborador", `${t.nome}: falta a matrícula do eSocial na empresa de origem.`, linkDoCadastro(t.personId)));
  }

  const id = novoId();
  const xml = envelope("S-2200", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    blocoDoTrabalhador(t),
    el("vinculo", [
      el("matricula", t.matricula),
      el("tpRegTrab", "1"),
      el("tpRegPrev", "1"),
      el("cadIni", "N"),
      el("infoRegimeTrab", [infoCeletista(t, sindicato, true, sucessao ? "2" : "1")]),
      infoContrato(t, e.cnpj),
      sucessao
        ? el("sucessaoVinc", [
            el("tpInsc", "1"),
            el("nrInsc", digitos(sucessao.cnpjAnterior)),
            el("matricAnt", sucessao.matriculaAnterior?.slice(0, 30)),
            el("dtTransf", sucessao.data),
            el("observacao", sucessao.observacao?.slice(0, 255)),
          ])
        : null,
    ]),
  ]);
  return {
    tipo: "S-2200",
    referencia: `${digitos(t.cpf) || t.nome} · ${t.matricula ?? "sem matrícula"}${sucessao ? " · sucessão" : ""}`,
    personId: t.personId,
    idEvento: id,
    xml,
    pendencias,
  };
}

// ─── S-2206 Alteração contratual ────────────────────────────────────────────

export function eventoS2206(
  e: EmpregadorEsocial,
  t: TrabalhadorCompleto,
  sindicato: SindicatoDoVinculo,
  alteracao: { data: string | null; descricao: string | null },
  novoId: GeradorDeId
): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t), ...pendenciasDoContrato(t, sindicato)];
  if (!alteracao.data) pendencias.push(falta("colaborador", `${t.nome}: informe a data em que a alteração vale.`, null));
  const id = novoId();
  const xml = envelope("S-2206", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("altContratual", [
      el("dtAlteracao", alteracao.data),
      el("dscAlt", alteracao.descricao?.slice(0, 150)),
      el("vinculo", [el("tpRegPrev", "1")]),
      el("infoRegimeTrab", [infoCeletista(t, sindicato, false)]),
      infoContrato(t, e.cnpj),
    ]),
  ]);
  return { tipo: "S-2206", referencia: `${digitos(t.cpf) || t.nome} · ${alteracao.data ?? "sem data"}`, personId: t.personId, idEvento: id, xml, pendencias };
}

// ─── S-2230 Afastamento ─────────────────────────────────────────────────────

/** Motivos de afastamento mais comuns (Tabela 18). Outro código o DP informa. */
export const MOTIVOS_DE_AFASTAMENTO: [string, string][] = [
  ["01", "Acidente ou doença do trabalho"],
  ["03", "Acidente ou doença não relacionada ao trabalho"],
  ["17", "Licença-maternidade"],
];

export type Afastamento = { motivo: string; inicio: string; fim: string | null; observacao: string | null };

export function eventoS2230(e: EmpregadorEsocial, t: { personId: string; nome: string; cpf: string | null; matricula: string | null }, a: Afastamento, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t)];
  if (!/^\d{2}$/.test(a.motivo)) pendencias.push(falta("colaborador", "Informe o motivo do afastamento (Tabela 18, 2 dígitos).", null));
  if (a.fim && a.fim < a.inicio) pendencias.push(falta("colaborador", "O fim do afastamento é antes do início.", null));
  if (!MOTIVOS_DE_AFASTAMENTO.some(([c]) => c === a.motivo)) {
    pendencias.push({ onde: "colaborador", texto: `Motivo ${a.motivo}: confira na Tabela 18 se pede informações a mais (ex.: acidente de trânsito, órgão de classe).`, link: null, bloqueia: false });
  }
  const id = novoId();
  const xml = envelope("S-2230", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("infoAfastamento", [
      el("iniAfastamento", [el("dtIniAfast", a.inicio), el("codMotAfast", a.motivo), el("observacao", a.observacao?.slice(0, 255))]),
      a.fim ? el("fimAfastamento", [el("dtTermAfast", a.fim)]) : null,
    ]),
  ]);
  return { tipo: "S-2230", referencia: `${digitos(t.cpf) || t.nome} · ${a.inicio}`, personId: t.personId, idEvento: id, xml, pendencias };
}

// ─── S-2298 Reintegração (25/11/2026, funcionalidade-756) ───────────────────

/** Tipo de reintegração que uma empresa privada informa (os outros são de servidor público e militar). */
export const TIPOS_DE_REINTEGRACAO: [string, string][] = [
  ["1", "Reintegração por decisão judicial"],
  ["2", "Reintegração por anistia legal"],
  ["9", "Outros"],
];

export type Reintegracao = { tipo: string; processo: string | null; leiAnistia: string | null; retorno: string; efeito: string; desligamento: string | null };

const dataIso = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function eventoS2298(e: EmpregadorEsocial, t: { personId: string; nome: string; cpf: string | null; matricula: string | null }, r: Reintegracao, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t)];
  if (!TIPOS_DE_REINTEGRACAO.some(([k]) => k === r.tipo)) pendencias.push(falta("colaborador", "Escolha o tipo da reintegração.", null));
  const processo = digitos(r.processo);
  if (r.tipo === "1" && processo.length !== 20) pendencias.push(falta("colaborador", "Na reintegração judicial, informe o número do processo (20 algarismos).", null));
  if (r.tipo === "2" && !r.leiAnistia) pendencias.push(falta("colaborador", "Na anistia, informe a lei (número e ano).", null));
  if (!dataIso(r.retorno) || !dataIso(r.efeito)) pendencias.push(falta("colaborador", "Informe a data do retorno e a dos efeitos financeiros.", null));
  else if (r.efeito > r.retorno) pendencias.push(falta("colaborador", "Os efeitos financeiros começam no retorno ou antes dele.", null));
  if (r.desligamento && ((dataIso(r.retorno) && r.retorno <= r.desligamento) || (dataIso(r.efeito) && r.efeito <= r.desligamento))) {
    pendencias.push(falta("colaborador", `O retorno e os efeitos são depois do desligamento (${r.desligamento.split("-").reverse().join("/")}).`, null));
  }
  const id = novoId();
  const xml = envelope("S-2298", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("infoReintegr", [
      el("tpReint", r.tipo),
      el("nrProcJud", r.tipo === "1" ? processo : null),
      el("nrLeiAnistia", r.tipo === "2" ? r.leiAnistia?.slice(0, 13) : null),
      el("dtEfetRetorno", dataIso(r.retorno)),
      el("dtEfeito", dataIso(r.efeito)),
    ]),
  ]);
  return { tipo: "S-2298", referencia: `${digitos(t.cpf) || t.nome} · ${r.retorno}`, personId: t.personId, idEvento: id, xml, pendencias };
}

// ─── S-2299 Desligamento ────────────────────────────────────────────────────

/** Motivo do desligamento (Tabela 19) a partir do motivo do cálculo de rescisão. */
export const MOTIVO_DO_DESLIGAMENTO: Record<MotivoCanonico, string> = {
  DISPENSA_JUSTA_CAUSA: "01",
  DISPENSA_SEM_JUSTA_CAUSA: "02",
  TERMINO_PRAZO_DETERMINADO: "06",
  TERMINO_EXPERIENCIA: "06",
  PEDIDO_DEMISSAO: "07",
  RESCISAO_INDIRETA: "17",
  ACORDO_MUTUO: "33",
};

export type VerbaRescisoria = { codigo: string; valor: number };

export type Desligamento = {
  motivo: MotivoCanonico;
  /** "AAAA-MM-DD": o último dia trabalhado. */
  data: string;
  avisoIndenizado: boolean;
  /** "AAAA-MM-DD": o fim projetado pelo aviso indenizado. */
  fimProjetado: string | null;
  verbas: VerbaRescisoria[];
};

export function eventoS2299(e: EmpregadorEsocial, t: { personId: string; nome: string; cpf: string | null; matricula: string | null }, d: Desligamento, novoId: GeradorDeId): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t)];
  const verbas = d.verbas.filter((v) => v.valor > 0);
  if (verbas.length === 0) pendencias.push(falta("colaborador", `${t.nome}: a rescisão não tem verbas calculadas.`, null));
  const id = novoId();
  const xml = envelope("S-2299", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("infoDeslig", [
      el("mtvDeslig", MOTIVO_DO_DESLIGAMENTO[d.motivo]),
      el("dtDeslig", d.data),
      el("indPagtoAPI", d.avisoIndenizado ? "S" : "N"),
      el("dtProjFimAPI", d.avisoIndenizado ? d.fimProjetado : null),
      el("pensAlim", "0"),
      el("verbasResc", [
        el("dmDev", [
          el("ideDmDev", `RESC${d.data.replace(/-/g, "")}`),
          el("infoPerApur", [
            el("ideEstabLot", [
              el("tpInsc", "1"),
              el("nrInsc", digitos(e.cnpj)),
              el("codLotacao", LOTACAO_PADRAO),
              ...verbas.map((v) => el("detVerbas", [el("codRubr", v.codigo), el("ideTabRubr", TABELA_DE_RUBRICAS), el("vrRubr", decimal(v.valor)), el("indApurIR", "0")])),
            ]),
          ]),
        ]),
      ]),
    ]),
  ]);
  return { tipo: "S-2299", referencia: `${digitos(t.cpf) || t.nome} · ${d.data}`, personId: t.personId, idEvento: id, xml, pendencias };
}

/**
 * O S-2299 da transferência para empresa do mesmo grupo (funcionalidade-771):
 * motivo 11 (Tabela 19), o último dia na empresa (a véspera da transferência)
 * e a empresa sucessora no grupo sucessaoVinc. Não há verbas rescisórias: o
 * contrato continua na outra empresa.
 */
export function eventoS2299Transferencia(
  e: EmpregadorEsocial,
  t: { personId: string; nome: string; cpf: string | null; matricula: string | null },
  d: { ultimoDia: string; cnpjSucessora: string | null; observacao: string | null },
  novoId: GeradorDeId
): EventoGerado {
  const pendencias = [...pendenciasDoEmpregador(e), ...pendenciasDoVinculo(t)];
  if (digitos(d.cnpjSucessora).length !== 14) pendencias.push(falta("empresa", "A empresa de destino da transferência está sem CNPJ.", null));
  const id = novoId();
  const xml = envelope("S-2299", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    ideVinculo(t),
    el("infoDeslig", [
      el("mtvDeslig", MOTIVO_TRANSFERENCIA),
      el("dtDeslig", d.ultimoDia),
      el("indPagtoAPI", "N"),
      el("pensAlim", "0"),
      el("observacoes", d.observacao ? [el("observacao", d.observacao.slice(0, 255))] : null),
      el("sucessaoVinc", [el("tpInsc", "1"), el("nrInsc", digitos(d.cnpjSucessora))]),
    ]),
  ]);
  return { tipo: "S-2299", referencia: `${digitos(t.cpf) || t.nome} · ${d.ultimoDia} · transferência`, personId: t.personId, idEvento: id, xml, pendencias };
}

/** Tabela 19, motivo 11: transferência para empresa do mesmo grupo, sem rescisão. */
export const MOTIVO_TRANSFERENCIA = "11";

/** A chave de cada verba do cálculo de rescisão do DP 2 → o papel da rubrica. */
export const PAPEL_DA_VERBA: Record<string, string> = {
  saldo_salario: "SALARIO",
  aviso_previo: "AVISO_INDENIZADO",
  aviso_desconto: "AVISO_DESCONTO",
  decimo_terceiro: "DECIMO_SEGUNDA",
  ferias_vencidas: "FERIAS_VENCIDAS_INDENIZADAS",
  ferias_proporcionais: "FERIAS_PROPORC_INDENIZADAS",
  terco_constitucional: "TERCO_FERIAS_INDENIZADAS",
  inss_mes: "INSS",
  irrf_mes: "IRRF",
  inss_decimo: "INSS_DECIMO",
  irrf_decimo: "IRRF_DECIMO",
  decimo_adiantado: "DECIMO_ADIANTADO",
  fgts: "FGTS",
};
