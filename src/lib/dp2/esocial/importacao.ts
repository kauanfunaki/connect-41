// Importar colaboradores e contratos a partir dos XML do eSocial (13/11/2026,
// DP 2 fase 3f, funcionalidade-666).
//
// Quando chega uma empresa nova, o DP traz os empregados do eSocial em vez de
// cadastrar um por um. Os XML vêm do download do portal (.zip), de uma
// exportação ou do Assinador local, que consulta o eSocial com o certificado
// ligado no CertDigital. Aqui só se lê: nada volta ao eSocial.
//
// Eventos lidos, de qualquer embrulho (arquivo solto, lote, retorno do
// download, inclusive com o XML em base64):
// - S-2200 admissão: pessoa, dependentes e contrato;
// - S-2205 alteração cadastral: endereço, estado civil, dependentes, contato;
// - S-2206 alteração contratual: salário, cargo, CBO, jornada;
// - S-2299 desligamento: a data de saída.
// Retificação (indRetif 2) troca a versão anterior; alterações valem pela
// data (dtAlteracao), a mais recente por último.
//
// Puro, sem banco.

import { XMLParser } from "fast-xml-parser";
import { unzipSync, strFromU8 } from "fflate";
import { cpfValido, digitos } from "./documentos";
import { DADOS_VAZIOS, lerDadosEsocial, type DadosEsocialDoVinculo } from "./cadastro";

type Bruto = Record<string, unknown>;

export type TipoImportado = "S-2200" | "S-2205" | "S-2206" | "S-2299";

const TAG: Record<string, TipoImportado> = {
  evtAdmissao: "S-2200",
  evtAltCadastral: "S-2205",
  evtAltContratual: "S-2206",
  evtDeslig: "S-2299",
};

export type ArquivoDoEsocial = { nome: string; conteudo: Uint8Array | string };

export type EventoLido = {
  tipo: TipoImportado;
  arquivo: string;
  /** Raiz do CNPJ (8 dígitos) ou o CNPJ/CPF inteiro do empregador, como veio. */
  empregador: string;
  cpf: string;
  matricula: string | null;
  retificacao: boolean;
  /** "AAAA-MM-DD": a data de efeito (alteração, desligamento) ou a admissão. */
  data: string | null;
  corpo: Bruto;
};

export type LeituraDosArquivos = { eventos: EventoLido[]; problemas: string[] };

export type DependenteImportado = {
  nome: string;
  cpf: string | null;
  nascimento: string | null;
  relacao: "CONJUGE" | "COMPANHEIRO" | "FILHO" | "ENTEADO" | "PAIS" | "OUTRO";
  irrf: boolean;
  salarioFamilia: boolean;
};

export type TrabalhadorImportado = {
  cpf: string;
  nome: string;
  nascimento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cep: string | null; uf: string | null };
  dados: DadosEsocialDoVinculo;
  matricula: string | null;
  categoria: string | null;
  admissao: string | null;
  desligamento: string | null;
  salario: number | null;
  tipoSalario: "MENSAL" | "HORISTA";
  horasMensais: number;
  nomeDoCargo: string | null;
  dependentes: DependenteImportado[];
  /** O que não deu para trazer ou precisa de conferência. */
  avisos: string[];
  /** Os eventos que formaram este trabalhador, para a Auditoria. */
  origem: string[];
};

export type Consolidacao = {
  trabalhadores: TrabalhadorImportado[];
  /** Eventos de outro empregador, recusados com o motivo. */
  deOutraEmpresa: number;
  problemas: string[];
};

// ─── Leitura ────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  // CPF, CEP e matrícula com zero à esquerda continuam texto.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const ehZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

function texto(c: Uint8Array | string): string {
  if (typeof c === "string") return c;
  let s = strFromU8(c);
  // Arquivo em ISO-8859-1 declarado: o strFromU8 lê UTF-8 e estraga os acentos.
  if (/encoding=["']ISO-8859-1["']/i.test(s.slice(0, 200)) || s.includes("�")) {
    s = Array.from(c, (b) => String.fromCharCode(b)).join("");
  }
  return s.replace(/^﻿/, "");
}

/** Abre .zip (inclusive .zip dentro de .zip) e devolve só os .xml. */
export function abrirArquivos(arquivos: ArquivoDoEsocial[]): { nome: string; xml: string }[] {
  const saida: { nome: string; xml: string }[] = [];
  const abrir = (nome: string, conteudo: Uint8Array | string, profundidade: number) => {
    if (typeof conteudo !== "string" && ehZip(conteudo)) {
      if (profundidade > 2) return;
      const dentro = unzipSync(conteudo);
      for (const [n, b] of Object.entries(dentro)) {
        if (n.endsWith("/")) continue;
        abrir(`${nome} › ${n}`, b, profundidade + 1);
      }
      return;
    }
    const t = texto(conteudo);
    if (t.trimStart().startsWith("<")) saida.push({ nome, xml: t });
  };
  for (const a of arquivos) abrir(a.nome, a.conteudo, 0);
  return saida;
}

const objeto = (v: unknown): v is Bruto => typeof v === "object" && v !== null && !Array.isArray(v);
const lista = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** O texto de um nó: "x", { "#text": "x" } ou nada. */
function val(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (objeto(v) && typeof v["#text"] === "string") return (v["#text"] as string).trim() || null;
  return null;
}

/** O primeiro nó com esse nome, em qualquer profundidade. */
export function achar(no: unknown, nome: string): unknown {
  if (Array.isArray(no)) {
    for (const x of no) {
      const r = achar(x, nome);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (!objeto(no)) return undefined;
  if (nome in no) return no[nome];
  for (const [k, v] of Object.entries(no)) {
    if (k.startsWith("@")) continue;
    const r = achar(v, nome);
    if (r !== undefined) return r;
  }
  return undefined;
}

const txt = (no: unknown, nome: string) => val(Array.isArray(achar(no, nome)) ? (achar(no, nome) as unknown[])[0] : achar(no, nome));

/** Cada evento que interessa, com o XML que estiver em base64 aberto também. */
function eventosDoNo(no: unknown, arquivo: string, saida: EventoLido[], profundidade = 0) {
  if (profundidade > 40) return;
  if (Array.isArray(no)) {
    for (const x of no) eventosDoNo(x, arquivo, saida, profundidade + 1);
    return;
  }
  if (typeof no === "string") {
    // O retorno do download pode trazer o XML do evento em base64.
    const s = no.trim();
    if (s.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(s) && (s.startsWith("PD94") || s.startsWith("PGVTb2Np") || s.startsWith("PGVzb2Np"))) {
      try {
        const xml = Buffer.from(s, "base64").toString("utf8");
        eventosDoNo(parser.parse(xml), arquivo, saida, profundidade + 1);
      } catch {
        /* não era XML */
      }
    }
    return;
  }
  if (!objeto(no)) return;
  for (const [k, v] of Object.entries(no)) {
    if (k.startsWith("@")) continue;
    const tipo = TAG[k];
    if (tipo) {
      for (const corpo of lista(v as Bruto | Bruto[])) {
        if (!objeto(corpo)) continue;
        const ev = montarEvento(tipo, corpo, arquivo);
        if (ev) saida.push(ev);
      }
      continue;
    }
    eventosDoNo(v, arquivo, saida, profundidade + 1);
  }
}

function montarEvento(tipo: TipoImportado, corpo: Bruto, arquivo: string): EventoLido | null {
  const ideEmpregador = achar(corpo, "ideEmpregador");
  const empregador = digitos(txt(ideEmpregador, "nrInsc"));
  const cpf = digitos(txt(corpo, "cpfTrab"));
  if (!cpf) return null;
  const data =
    tipo === "S-2200"
      ? txt(corpo, "dtAdm") ?? txt(corpo, "dtExercicio")
      : tipo === "S-2299"
        ? txt(corpo, "dtDeslig")
        : txt(corpo, "dtAlteracao");
  return {
    tipo,
    arquivo,
    empregador,
    cpf,
    matricula: txt(achar(corpo, "ideVinculo") ?? achar(corpo, "vinculo") ?? corpo, "matricula"),
    retificacao: txt(achar(corpo, "ideEvento"), "indRetif") === "2",
    data,
    corpo,
  };
}

export function lerArquivosDoEsocial(arquivos: ArquivoDoEsocial[]): LeituraDosArquivos {
  const problemas: string[] = [];
  const eventos: EventoLido[] = [];
  let xmls: { nome: string; xml: string }[] = [];
  try {
    xmls = abrirArquivos(arquivos);
  } catch {
    return { eventos, problemas: ["Não consegui abrir o arquivo. Mande o .zip baixado do eSocial ou os .xml dos eventos."] };
  }
  if (xmls.length === 0) problemas.push("Nenhum XML encontrado nos arquivos enviados.");
  for (const { nome, xml } of xmls) {
    try {
      const antes = eventos.length;
      eventosDoNo(parser.parse(xml), nome, eventos);
      if (eventos.length === antes && /evt(Admissao|AltCadastral|AltContratual|Deslig)/.test(xml)) {
        problemas.push(`${nome}: evento sem CPF do trabalhador, ignorado.`);
      }
    } catch {
      problemas.push(`${nome}: não é um XML válido.`);
    }
  }
  return { eventos, problemas };
}

// ─── Consolidação por trabalhador ───────────────────────────────────────────

const RELACAO_DO_TPDEP: Record<string, DependenteImportado["relacao"]> = {
  "01": "CONJUGE",
  "02": "COMPANHEIRO",
  "03": "FILHO",
  "04": "FILHO",
  "06": "OUTRO",
  "09": "PAIS",
  "10": "OUTRO",
  "11": "OUTRO",
  "12": "OUTRO",
  "99": "OUTRO",
};

function lerDependentes(no: unknown): DependenteImportado[] {
  const deps = lista(achar(no, "dependente") as Bruto | Bruto[] | undefined);
  return deps.filter(objeto).map((d) => ({
    nome: (val(d.nmDep) ?? "Dependente").slice(0, 120),
    cpf: digitos(val(d.cpfDep)) || null,
    nascimento: val(d.dtNascto),
    relacao: RELACAO_DO_TPDEP[val(d.tpDep) ?? ""] ?? "OUTRO",
    irrf: val(d.depIRRF) === "S",
    salarioFamilia: val(d.depSF) === "S",
  }));
}

function lerEndereco(no: unknown): TrabalhadorImportado["endereco"] | null {
  const br = achar(achar(no, "endereco"), "brasil");
  if (!objeto(br)) return null;
  const tipo = val(br.tpLograd);
  const logradouro = val(br.dscLograd);
  return {
    logradouro: logradouro ? (tipo && !logradouro.toUpperCase().startsWith(tipo.toUpperCase()) ? `${tipo} ${logradouro}` : logradouro) : null,
    numero: val(br.nrLograd),
    complemento: val(br.complemento),
    bairro: val(br.bairro),
    cep: digitos(val(br.cep)) || null,
    uf: val(br.uf),
  };
}

/** Os campos de pessoa que o S-2200 (grupo trabalhador) e o S-2205 (dadosTrabalhador) têm em comum. */
function aplicarPessoa(t: TrabalhadorImportado, no: unknown) {
  const nome = txt(no, "nmTrab");
  if (nome) t.nome = nome;
  const nasc = txt(achar(no, "nascimento") ?? no, "dtNascto");
  if (nasc && !t.nascimento) t.nascimento = nasc;
  const dados: Partial<DadosEsocialDoVinculo> = {};
  for (const [campo, tag] of [
    ["sexo", "sexo"],
    ["racaCor", "racaCor"],
    ["estadoCivil", "estCiv"],
    ["grauInstrucao", "grauInstr"],
  ] as const) {
    const v = txt(no, tag);
    if (v) dados[campo] = campo === "grauInstrucao" ? v.padStart(2, "0") : v;
  }
  const end = lerEndereco(no);
  if (end) {
    t.endereco = end;
    const mun = digitos(txt(achar(achar(no, "endereco"), "brasil"), "codMunic"));
    if (mun) dados.codigoMunicipio = mun;
  }
  t.dados = lerDadosEsocial({ ...t.dados, ...dados });
  const contato = achar(no, "contato");
  if (contato) {
    t.telefone = txt(contato, "fonePrinc") ?? t.telefone;
    t.email = txt(contato, "emailPrinc") ?? t.email;
  }
  // Os dependentes vêm sempre completos: a lista nova substitui a anterior.
  if (achar(no, "dependente") !== undefined) t.dependentes = lerDependentes(no);
}

/** Cargo, CBO, salário, jornada e categoria, do S-2200 e do S-2206. */
function aplicarContrato(t: TrabalhadorImportado, no: unknown) {
  const contrato = achar(no, "infoContrato");
  if (!contrato) return;
  const cargo = txt(contrato, "nmCargo") ?? txt(contrato, "nmFuncao");
  if (cargo) t.nomeDoCargo = cargo;
  const cbo = digitos(txt(contrato, "CBOCargo") ?? txt(contrato, "CBOFuncao"));
  const categoria = txt(contrato, "codCateg");
  if (categoria) t.categoria = categoria;
  const dados: Partial<DadosEsocialDoVinculo> = {};
  if (cbo) dados.cbo = cbo;
  const rem = achar(contrato, "remuneracao");
  if (rem) {
    const vr = txt(rem, "vrSalFx");
    const und = txt(rem, "undSalFixo");
    if (vr !== null) t.salario = Number(vr.replace(",", "."));
    if (und === "1") t.tipoSalario = "HORISTA";
    else if (und === "5") t.tipoSalario = "MENSAL";
    else if (und) {
      t.tipoSalario = "MENSAL";
      t.avisos.push(`Salário em unidade ${und} no eSocial (não é hora nem mês): confira o valor mensal no contrato.`);
    }
  }
  const duracao = achar(contrato, "duracao");
  if (duracao) {
    const tp = txt(duracao, "tpContr");
    if (tp) dados.tipoContrato = tp;
    const fim = txt(duracao, "dtTerm");
    if (fim) dados.dataTermino = fim;
  }
  const hor = achar(contrato, "horContratual");
  if (hor) {
    const sem = txt(hor, "qtdHrsSem");
    if (sem) {
      const h = Math.round(Number(sem.replace(",", ".")) * 5);
      if (h > 0 && h <= 300) t.horasMensais = h;
    }
    const tj = txt(hor, "tpJornada");
    if (tj) dados.tipoJornada = tj;
    const dsc = txt(hor, "dscJorn");
    if (dsc) dados.descricaoJornada = dsc;
  }
  t.dados = lerDadosEsocial({ ...t.dados, ...dados });
}

function vazio(cpf: string): TrabalhadorImportado {
  return {
    cpf,
    nome: "",
    nascimento: null,
    telefone: null,
    email: null,
    endereco: { logradouro: null, numero: null, complemento: null, bairro: null, cep: null, uf: null },
    dados: { ...DADOS_VAZIOS },
    matricula: null,
    categoria: null,
    admissao: null,
    desligamento: null,
    salario: null,
    tipoSalario: "MENSAL",
    horasMensais: 220,
    nomeDoCargo: null,
    dependentes: [],
    avisos: [],
    origem: [],
  };
}

/** A raiz do CNPJ (8 dígitos): o eSocial identifica o empregador por ela. */
export const raizDoCnpj = (cnpj: string | null | undefined) => {
  const d = digitos(cnpj);
  return d.length === 14 ? d.slice(0, 8) : d;
};

const ORDEM: Record<TipoImportado, number> = { "S-2200": 0, "S-2205": 1, "S-2206": 1, "S-2299": 2 };

/**
 * Junta os eventos de cada CPF num trabalhador só: a admissão, depois as
 * alterações em ordem de data e, por fim, o desligamento. Eventos de outro
 * empregador ficam de fora (contados em `deOutraEmpresa`).
 */
export function consolidarTrabalhadores(eventos: EventoLido[], cnpjDaEmpresa: string): Consolidacao {
  const raiz = raizDoCnpj(cnpjDaEmpresa);
  const problemas: string[] = [];
  let deOutraEmpresa = 0;
  const daEmpresa = eventos.filter((e) => {
    const ok = !raiz || raizDoCnpj(e.empregador) === raiz;
    if (!ok) deOutraEmpresa++;
    return ok;
  });

  // Retificação: dentro do mesmo tipo, CPF e data, a última retificada vence.
  const unicos = new Map<string, EventoLido>();
  for (const e of daEmpresa) {
    const chave = `${e.tipo}|${e.cpf}|${e.matricula ?? ""}|${e.tipo === "S-2200" ? "" : (e.data ?? "")}`;
    const antes = unicos.get(chave);
    if (!antes || e.retificacao || !antes.retificacao) unicos.set(chave, e);
  }

  const porCpf = new Map<string, EventoLido[]>();
  for (const e of unicos.values()) porCpf.set(e.cpf, [...(porCpf.get(e.cpf) ?? []), e]);

  const trabalhadores: TrabalhadorImportado[] = [];
  for (const [cpf, evs] of porCpf) {
    evs.sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo] || (a.data ?? "").localeCompare(b.data ?? ""));
    const t = vazio(cpf);
    const admissao = evs.find((e) => e.tipo === "S-2200");
    if (!admissao) {
      t.avisos.push("Sem a admissão (S-2200) nos arquivos: só dá para completar quem já está cadastrado.");
    }
    for (const e of evs) {
      t.origem.push(`${e.tipo}${e.data ? ` de ${e.data}` : ""} (${e.arquivo})`);
      if (e.matricula) t.matricula = e.matricula;
      if (e.tipo === "S-2200") {
        aplicarPessoa(t, achar(e.corpo, "trabalhador"));
        t.admissao = e.data;
        aplicarContrato(t, achar(e.corpo, "vinculo") ?? e.corpo);
      } else if (e.tipo === "S-2205") {
        aplicarPessoa(t, achar(e.corpo, "dadosTrabalhador") ?? achar(e.corpo, "alteracao"));
      } else if (e.tipo === "S-2206") {
        aplicarContrato(t, achar(e.corpo, "altContratual") ?? e.corpo);
      } else if (e.tipo === "S-2299") {
        t.desligamento = e.data;
      }
    }
    if (!t.nome) t.nome = `CPF ${cpf}`;
    if (!cpfValido(cpf)) t.avisos.push("CPF inválido no eSocial.");
    if (t.salario === null && admissao) t.avisos.push("Sem salário no eSocial: informe no contrato.");
    trabalhadores.push(t);
  }
  trabalhadores.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (deOutraEmpresa > 0) {
    problemas.push(`${deOutraEmpresa} evento(s) de outro CNPJ ficaram de fora: confira se o arquivo é desta empresa.`);
  }
  return { trabalhadores, deOutraEmpresa, problemas };
}

/** Quantos dependentes contam para o IRRF e quantos filhos para o salário-família. */
export function contagemDeDependentes(deps: DependenteImportado[]) {
  return { irrf: deps.filter((d) => d.irrf).length, salarioFamilia: deps.filter((d) => d.salarioFamilia).length };
}
