// Modelos de documento do Societário (27/11/2026, funcionalidade-891): os campos
// que o .docx do escritório pode usar e o texto de cada um, montado com o
// cadastro da empresa, os sócios, o processo e quem assina como advogado e
// testemunha. É o "Modelos de Documentos" do Domínio Registro, com o
// docxtemplater do termo aditivo (src/lib/honorarios/termo/docx.ts).
//
// Regra pura: sem banco. O servidor (servidor.ts) lê o cadastro e passa para cá.

import { formatCep, formatCnpj, formatCpf, formatarReais } from "@/lib/format";

export const TIPO_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Os tipos de documento do Registro, na ordem da tela. */
export const TIPOS_DE_MODELO = [
  "CONTRATO_SOCIAL",
  "ALTERACAO_CONTRATUAL",
  "DISTRATO",
  "DECLARACAO_ME_EPP",
  "ATA",
  "REQUERIMENTO",
  "OUTRO",
] as const;
export type TipoDeModelo = (typeof TIPOS_DE_MODELO)[number];

export const ROTULO_DO_TIPO: Record<TipoDeModelo, string> = {
  CONTRATO_SOCIAL: "Contrato social",
  ALTERACAO_CONTRATUAL: "Alteração contratual",
  DISTRATO: "Distrato social",
  DECLARACAO_ME_EPP: "Declaração de ME/EPP",
  ATA: "Ata de reunião",
  REQUERIMENTO: "Requerimento",
  OUTRO: "Outro",
};

export const ehTipoDeModelo = (v: unknown): v is TipoDeModelo => typeof v === "string" && (TIPOS_DE_MODELO as readonly string[]).includes(v);

/** Advogado e testemunhas: quem assina o documento além dos sócios. */
export const PAPEIS_DE_PARTICIPANTE = ["ADVOGADO", "TESTEMUNHA"] as const;
export type PapelDoParticipante = (typeof PAPEIS_DE_PARTICIPANTE)[number];
export const ROTULO_DO_PAPEL: Record<PapelDoParticipante, string> = { ADVOGADO: "Advogado", TESTEMUNHA: "Testemunha" };
export const ehPapel = (v: unknown): v is PapelDoParticipante => v === "ADVOGADO" || v === "TESTEMUNHA";

/** O lugar de cada pessoa no processo — o mesmo do Domínio: um advogado e duas testemunhas. */
export const LUGARES = ["ADVOGADO", "TESTEMUNHA_1", "TESTEMUNHA_2"] as const;
export type Lugar = (typeof LUGARES)[number];
export const PAPEL_DO_LUGAR: Record<Lugar, PapelDoParticipante> = { ADVOGADO: "ADVOGADO", TESTEMUNHA_1: "TESTEMUNHA", TESTEMUNHA_2: "TESTEMUNHA" };
export const ROTULO_DO_LUGAR: Record<Lugar, string> = { ADVOGADO: "Advogado", TESTEMUNHA_1: "Testemunha 1", TESTEMUNHA_2: "Testemunha 2" };

// ─── O que entra ────────────────────────────────────────────────────────────

export type Endereco = {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

export type SocioDoDocumento = {
  nome: string;
  /** Só dígitos: CPF (11) ou CNPJ (14). */
  documento: string | null;
  qualificacao: string | null;
  administrador: boolean;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  endereco: Endereco;
  quotas: number | null;
  /** Em reais. */
  capital: number | null;
  /** Em porcento. */
  percentual: number | null;
  /** Saiu da sociedade (alteração e distrato pedem quem saiu). */
  saiu: boolean;
};

export type PessoaQueAssina = {
  nome: string;
  cpf: string | null;
  rg: string | null;
  oab: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  endereco: string | null;
};

export type EntradaDoDocumento = {
  empresa: {
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string | null;
    nire: string | null;
    naturezaJuridica: string | null;
    cnaePrincipal: string | null;
    cnaesSecundarios: string | null;
    inscricaoEstadual: string | null;
    inscricaoMunicipal: string | null;
    dataDeAbertura: Date | null;
    endereco: Endereco;
  };
  socios: SocioDoDocumento[];
  processo: { numero: number; tipo: string; titulo: string | null };
  advogado: PessoaQueAssina | null;
  testemunha1: PessoaQueAssina | null;
  testemunha2: PessoaQueAssina | null;
};

// ─── O catálogo dos campos ──────────────────────────────────────────────────

export type GrupoDoCampo = "Empresa" | "Sócios" | "Processo" | "Advogado e testemunhas" | "Data";

export type CampoDoModelo = { nome: string; grupo: GrupoDoCampo; descricao: string; exemplo: string };

const pessoa = (prefixo: string, quem: string): CampoDoModelo[] => [
  { nome: `${prefixo}_NOME`, grupo: "Advogado e testemunhas", descricao: `Nome ${quem}`, exemplo: "MARIA DA SILVA" },
  { nome: `${prefixo}_CPF`, grupo: "Advogado e testemunhas", descricao: `CPF ${quem}`, exemplo: "123.456.789-09" },
  { nome: `${prefixo}_RG`, grupo: "Advogado e testemunhas", descricao: `RG ${quem}`, exemplo: "12.345.678-9" },
  { nome: `${prefixo}_TEXTO`, grupo: "Advogado e testemunhas", descricao: `Qualificação completa ${quem}`, exemplo: "MARIA DA SILVA, brasileira, casada, advogada, CPF 123.456.789-09" },
];

/** Todos os campos que o Connect preenche. Os de lista vão dentro de {#SOCIOS}…{/SOCIOS}. */
export const CAMPOS: CampoDoModelo[] = [
  { nome: "EMPRESA_RAZAO_SOCIAL", grupo: "Empresa", descricao: "Razão social", exemplo: "EMPRESA EXEMPLO LTDA" },
  { nome: "EMPRESA_NOME_FANTASIA", grupo: "Empresa", descricao: "Nome fantasia", exemplo: "Exemplo" },
  { nome: "EMPRESA_CNPJ", grupo: "Empresa", descricao: "CNPJ", exemplo: "11.222.333/0001-81" },
  { nome: "EMPRESA_NIRE", grupo: "Empresa", descricao: "NIRE", exemplo: "41208765432" },
  { nome: "EMPRESA_NATUREZA_JURIDICA", grupo: "Empresa", descricao: "Natureza jurídica", exemplo: "206-2 - Sociedade Empresária Limitada" },
  { nome: "EMPRESA_CNAE_PRINCIPAL", grupo: "Empresa", descricao: "CNAE principal", exemplo: "6920-6/01" },
  { nome: "EMPRESA_CNAES_SECUNDARIOS", grupo: "Empresa", descricao: "CNAEs secundários, separados por vírgula", exemplo: "6911-7/01, 8211-3/00" },
  { nome: "EMPRESA_INSCRICAO_ESTADUAL", grupo: "Empresa", descricao: "Inscrição estadual", exemplo: "9012345678" },
  { nome: "EMPRESA_INSCRICAO_MUNICIPAL", grupo: "Empresa", descricao: "Inscrição municipal", exemplo: "123456" },
  { nome: "EMPRESA_DATA_ABERTURA", grupo: "Empresa", descricao: "Data de abertura", exemplo: "05/03/2019" },
  { nome: "EMPRESA_ENDERECO", grupo: "Empresa", descricao: "Endereço completo, numa linha", exemplo: "Rua das Flores, nº 120, sala 4, Bairro Centro, Curitiba/PR, CEP 80010-000" },
  { nome: "EMPRESA_LOGRADOURO", grupo: "Empresa", descricao: "Logradouro", exemplo: "Rua das Flores" },
  { nome: "EMPRESA_NUMERO", grupo: "Empresa", descricao: "Número", exemplo: "120" },
  { nome: "EMPRESA_COMPLEMENTO", grupo: "Empresa", descricao: "Complemento", exemplo: "sala 4" },
  { nome: "EMPRESA_BAIRRO", grupo: "Empresa", descricao: "Bairro", exemplo: "Centro" },
  { nome: "EMPRESA_CIDADE", grupo: "Empresa", descricao: "Cidade", exemplo: "Curitiba" },
  { nome: "EMPRESA_UF", grupo: "Empresa", descricao: "UF", exemplo: "PR" },
  { nome: "EMPRESA_CEP", grupo: "Empresa", descricao: "CEP", exemplo: "80010-000" },
  { nome: "CAPITAL_SOCIAL", grupo: "Empresa", descricao: "Capital social: soma do capital dos sócios que estão na sociedade", exemplo: "R$ 10.000,00" },
  { nome: "CAPITAL_SOCIAL_EXTENSO", grupo: "Empresa", descricao: "Capital social por extenso", exemplo: "dez mil reais" },
  { nome: "TOTAL_QUOTAS", grupo: "Empresa", descricao: "Total de quotas dos sócios que estão na sociedade", exemplo: "10.000" },

  { nome: "SOCIOS_TEXTO", grupo: "Sócios", descricao: "A qualificação de todos os sócios, um parágrafo", exemplo: "JOÃO SOUZA, brasileiro, casado, empresário, CPF 123.456.789-09, residente na Rua A, nº 1, Bairro Centro, Curitiba/PR, CEP 80010-000; e …" },
  { nome: "ADMINISTRADORES", grupo: "Sócios", descricao: "Nome dos administradores, separados por vírgula e “e”", exemplo: "JOÃO SOUZA e ANA LIMA" },
  { nome: "#SOCIOS", grupo: "Sócios", descricao: "Abre a lista dos sócios que estão na sociedade; fecha com {/SOCIOS}", exemplo: "" },
  { nome: "#SOCIOS_QUE_SAIRAM", grupo: "Sócios", descricao: "Abre a lista dos sócios que saíram; fecha com {/SOCIOS_QUE_SAIRAM}", exemplo: "" },
  { nome: "NOME", grupo: "Sócios", descricao: "Dentro da lista: nome do sócio", exemplo: "JOÃO SOUZA" },
  { nome: "DOCUMENTO", grupo: "Sócios", descricao: "Dentro da lista: CPF ou CNPJ", exemplo: "123.456.789-09" },
  { nome: "QUALIFICACAO", grupo: "Sócios", descricao: "Dentro da lista: qualificação na Receita", exemplo: "Sócio-Administrador" },
  { nome: "TEXTO", grupo: "Sócios", descricao: "Dentro da lista: a qualificação completa do sócio", exemplo: "JOÃO SOUZA, brasileiro, casado, empresário, CPF 123.456.789-09, residente na …" },
  { nome: "NACIONALIDADE", grupo: "Sócios", descricao: "Dentro da lista: nacionalidade", exemplo: "brasileiro" },
  { nome: "ESTADO_CIVIL", grupo: "Sócios", descricao: "Dentro da lista: estado civil", exemplo: "casado" },
  { nome: "PROFISSAO", grupo: "Sócios", descricao: "Dentro da lista: profissão", exemplo: "empresário" },
  { nome: "ENDERECO", grupo: "Sócios", descricao: "Dentro da lista: endereço completo", exemplo: "Rua A, nº 1, Bairro Centro, Curitiba/PR, CEP 80010-000" },
  { nome: "QUOTAS", grupo: "Sócios", descricao: "Dentro da lista: quotas", exemplo: "5.000" },
  { nome: "CAPITAL", grupo: "Sócios", descricao: "Dentro da lista: capital do sócio", exemplo: "R$ 5.000,00" },
  { nome: "CAPITAL_EXTENSO", grupo: "Sócios", descricao: "Dentro da lista: capital do sócio por extenso", exemplo: "cinco mil reais" },
  { nome: "PERCENTUAL", grupo: "Sócios", descricao: "Dentro da lista: participação", exemplo: "50%" },
  { nome: "ADMINISTRADOR", grupo: "Sócios", descricao: "Dentro da lista: “sim” ou “não”", exemplo: "sim" },

  { nome: "PROCESSO_NUMERO", grupo: "Processo", descricao: "Número do processo no Connect", exemplo: "12" },
  { nome: "PROCESSO_TIPO", grupo: "Processo", descricao: "Tipo do processo", exemplo: "Alteração contratual" },
  { nome: "PROCESSO_TITULO", grupo: "Processo", descricao: "Título do processo", exemplo: "Filial de Pinhais" },

  ...pessoa("ADVOGADO", "do advogado"),
  { nome: "ADVOGADO_OAB", grupo: "Advogado e testemunhas", descricao: "OAB do advogado", exemplo: "OAB/PR 12.345" },
  ...pessoa("TESTEMUNHA1", "da testemunha 1"),
  ...pessoa("TESTEMUNHA2", "da testemunha 2"),

  { nome: "DATA", grupo: "Data", descricao: "Data do dia", exemplo: "27/11/2026" },
  { nome: "DATA_EXTENSO", grupo: "Data", descricao: "Data por extenso", exemplo: "27 de novembro de 2026" },
  { nome: "LOCAL_E_DATA", grupo: "Data", descricao: "Cidade da empresa e data por extenso", exemplo: "Curitiba, 27 de novembro de 2026" },
];

/** Os nomes que o modelo pode usar, sem o "#" e o "/" das listas. */
export const NOMES_DOS_CAMPOS: ReadonlySet<string> = new Set(CAMPOS.map((c) => c.nome.replace(/^#/, "")));

// ─── Textos ─────────────────────────────────────────────────────────────────

const cheio = (v: string | null | undefined): v is string => !!v && v.trim().length > 0;
const t = (v: string | null | undefined) => (cheio(v) ? v.trim() : "");

/** "Rua das Flores, nº 120, sala 4, Bairro Centro, Curitiba/PR, CEP 80010-000": cada pedaço só se houver. */
export function enderecoEmLinha(e: Endereco): string {
  const partes: string[] = [];
  if (cheio(e.logradouro)) partes.push(cheio(e.numero) ? `${e.logradouro.trim()}, nº ${e.numero.trim()}` : e.logradouro.trim());
  if (cheio(e.complemento)) partes.push(e.complemento.trim());
  if (cheio(e.bairro)) partes.push(`Bairro ${e.bairro.trim()}`);
  if (cheio(e.cidade)) partes.push(cheio(e.uf) ? `${e.cidade.trim()}/${e.uf.trim().toUpperCase()}` : e.cidade.trim());
  if (cheio(e.cep)) partes.push(`CEP ${formatCep(e.cep)}`);
  return partes.join(", ");
}

function documentoFormatado(doc: string | null): string {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return formatCpf(d);
  if (d.length === 14) return formatCnpj(d);
  return t(doc);
}

/** "JOÃO SOUZA, brasileiro, casado, empresário, CPF 123.456.789-09, residente e domiciliado na …". */
export function qualificacaoDoSocio(s: SocioDoDocumento): string {
  const d = (s.documento ?? "").replace(/\D/g, "");
  const pj = d.length === 14;
  const partes = [s.nome.trim().toUpperCase()];
  if (pj) {
    partes.push(`pessoa jurídica inscrita no CNPJ sob o nº ${formatCnpj(d)}`);
    const end = enderecoEmLinha(s.endereco);
    if (end) partes.push(`com sede na ${end}`);
    return partes.join(", ");
  }
  for (const v of [s.nacionalidade, s.estadoCivil, s.profissao]) if (cheio(v)) partes.push(v.trim());
  if (d.length === 11) partes.push(`CPF ${formatCpf(d)}`);
  const end = enderecoEmLinha(s.endereco);
  if (end) partes.push(`residente e domiciliado na ${end}`);
  return partes.join(", ");
}

/** A qualificação do advogado ou da testemunha. */
export function qualificacaoDaPessoa(p: PessoaQueAssina): string {
  const partes = [p.nome.trim().toUpperCase()];
  for (const v of [p.nacionalidade, p.estadoCivil, p.profissao]) if (cheio(v)) partes.push(v.trim());
  if (cheio(p.oab)) partes.push(`inscrito na ${p.oab.trim()}`);
  if (cheio(p.rg)) partes.push(`RG ${p.rg.trim()}`);
  if (cheio(p.cpf)) partes.push(`CPF ${formatCpf(p.cpf)}`);
  if (cheio(p.endereco)) partes.push(`residente na ${p.endereco.trim()}`);
  return partes.join(", ");
}

/** "A, B e C". */
export function juntarComE(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

// ─── Números por extenso (reais) ────────────────────────────────────────────

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** De 1 a 999. */
function ate999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]!);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]!);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!);
    }
  }
  return partes.join(" e ");
}

const ESCALAS: [singular: string, plural: string][] = [
  ["", ""],
  ["mil", "mil"],
  ["milhão", "milhões"],
  ["bilhão", "bilhões"],
];

/** Inteiro por extenso, até 999 bilhões: 1.250.300 → "um milhão, duzentos e cinquenta mil e trezentos". */
export function inteiroPorExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1e12) return "";
  const inteiro = Math.floor(n);
  if (inteiro === 0) return "zero";
  const grupos: number[] = [];
  for (let x = inteiro; x > 0; x = Math.floor(x / 1000)) grupos.push(x % 1000);
  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]!;
    if (g === 0) continue;
    const [sing, plur] = ESCALAS[i]!;
    const texto = i === 1 && g === 1 ? "mil" : i === 0 ? ate999(g) : `${ate999(g)} ${g === 1 ? sing : plur}`;
    partes.push({ texto, valor: g });
  }
  // O "e" antes do último grupo quando ele é menor que 100 ou é centena redonda
  // ("mil e cem", "dois mil e trinta"); senão, vírgula ("mil, duzentos e dez").
  return partes
    .map((p, i) => {
      if (i === 0) return p.texto;
      const ultimo = i === partes.length - 1;
      const comE = ultimo && (p.valor < 100 || p.valor % 100 === 0);
      return `${comE ? " e " : ", "}${p.texto}`;
    })
    .join("");
}

/** R$ 1.234,50 → "mil, duzentos e trinta e quatro reais e cinquenta centavos". */
export function reaisPorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) return "";
  const centavosTotais = Math.round(valor * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const texto = inteiroPorExtenso(reais);
    // "um milhão de reais": milhão e bilhão redondos pedem o "de".
    const de = reais >= 1e6 && reais % 1e6 === 0 ? " de" : "";
    partes.push(`${texto}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  return partes.length > 0 ? partes.join(" e ") : "zero real";
}

// ─── Datas ──────────────────────────────────────────────────────────────────

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function partesEmSaoPaulo(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { dia: p.day as string, mes: Number(p.month), ano: p.year as string };
}

export function dataCurta(d: Date): string {
  const p = partesEmSaoPaulo(d);
  return `${p.dia}/${String(p.mes).padStart(2, "0")}/${p.ano}`;
}

/** "27 de novembro de 2026" (o dia de São Paulo; "1º" no primeiro dia, como se escreve em contrato). */
export function dataPorExtenso(d: Date): string {
  const p = partesEmSaoPaulo(d);
  const dia = Number(p.dia) === 1 ? "1º" : String(Number(p.dia));
  return `${dia} de ${MESES[p.mes - 1]} de ${p.ano}`;
}

// ─── Os dados do modelo ─────────────────────────────────────────────────────

const inteiroBr = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
const percentualBr = (n: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(n)}%`;

function socioNoModelo(s: SocioDoDocumento) {
  return {
    NOME: s.nome.trim().toUpperCase(),
    DOCUMENTO: documentoFormatado(s.documento),
    QUALIFICACAO: t(s.qualificacao),
    TEXTO: qualificacaoDoSocio(s),
    NACIONALIDADE: t(s.nacionalidade),
    ESTADO_CIVIL: t(s.estadoCivil),
    PROFISSAO: t(s.profissao),
    ENDERECO: enderecoEmLinha(s.endereco),
    QUOTAS: s.quotas !== null ? inteiroBr(s.quotas) : "",
    CAPITAL: s.capital !== null ? formatarReais(s.capital) : "",
    CAPITAL_EXTENSO: s.capital !== null ? reaisPorExtenso(s.capital) : "",
    PERCENTUAL: s.percentual !== null ? percentualBr(s.percentual) : "",
    ADMINISTRADOR: s.administrador ? "sim" : "não",
  };
}

function pessoaNoModelo(prefixo: string, p: PessoaQueAssina | null, oab = false): Record<string, string> {
  const r: Record<string, string> = {
    [`${prefixo}_NOME`]: p ? p.nome.trim().toUpperCase() : "",
    [`${prefixo}_CPF`]: p?.cpf ? formatCpf(p.cpf) : "",
    [`${prefixo}_RG`]: t(p?.rg),
    [`${prefixo}_TEXTO`]: p ? qualificacaoDaPessoa(p) : "",
  };
  if (oab) r[`${prefixo}_OAB`] = t(p?.oab);
  return r;
}

export type DadosDoModelo = Record<string, string | Record<string, string>[]>;

/** Tudo o que o modelo pode pedir. Campo sem dado sai vazio. */
export function dadosDoDocumento(e: EntradaDoDocumento, agora: Date): DadosDoModelo {
  const emp = e.empresa;
  const naSociedade = e.socios.filter((s) => !s.saiu);
  const capital = naSociedade.reduce((soma, s) => soma + (s.capital ?? 0), 0);
  const temCapital = naSociedade.some((s) => s.capital !== null);
  const quotas = naSociedade.reduce((soma, s) => soma + (s.quotas ?? 0), 0);
  const temQuotas = naSociedade.some((s) => s.quotas !== null);
  const dataExtenso = dataPorExtenso(agora);
  return {
    EMPRESA_RAZAO_SOCIAL: emp.razaoSocial.trim().toUpperCase(),
    EMPRESA_NOME_FANTASIA: t(emp.nomeFantasia),
    EMPRESA_CNPJ: emp.cnpj ? formatCnpj(emp.cnpj) : "",
    EMPRESA_NIRE: t(emp.nire),
    EMPRESA_NATUREZA_JURIDICA: t(emp.naturezaJuridica),
    EMPRESA_CNAE_PRINCIPAL: t(emp.cnaePrincipal),
    EMPRESA_CNAES_SECUNDARIOS: (emp.cnaesSecundarios ?? "")
      .split(/[,;\n]/)
      .map((c) => c.trim())
      .filter(Boolean)
      .join(", "),
    EMPRESA_INSCRICAO_ESTADUAL: t(emp.inscricaoEstadual),
    EMPRESA_INSCRICAO_MUNICIPAL: t(emp.inscricaoMunicipal),
    EMPRESA_DATA_ABERTURA: emp.dataDeAbertura ? dataCurta(emp.dataDeAbertura) : "",
    EMPRESA_ENDERECO: enderecoEmLinha(emp.endereco),
    EMPRESA_LOGRADOURO: t(emp.endereco.logradouro),
    EMPRESA_NUMERO: t(emp.endereco.numero),
    EMPRESA_COMPLEMENTO: t(emp.endereco.complemento),
    EMPRESA_BAIRRO: t(emp.endereco.bairro),
    EMPRESA_CIDADE: t(emp.endereco.cidade),
    EMPRESA_UF: t(emp.endereco.uf).toUpperCase(),
    EMPRESA_CEP: emp.endereco.cep ? formatCep(emp.endereco.cep) : "",
    CAPITAL_SOCIAL: temCapital ? formatarReais(capital) : "",
    CAPITAL_SOCIAL_EXTENSO: temCapital ? reaisPorExtenso(capital) : "",
    TOTAL_QUOTAS: temQuotas ? inteiroBr(quotas) : "",

    SOCIOS_TEXTO: naSociedade.map(qualificacaoDoSocio).join("; "),
    ADMINISTRADORES: juntarComE(naSociedade.filter((s) => s.administrador).map((s) => s.nome.trim().toUpperCase())),
    SOCIOS: naSociedade.map(socioNoModelo),
    SOCIOS_QUE_SAIRAM: e.socios.filter((s) => s.saiu).map(socioNoModelo),

    PROCESSO_NUMERO: String(e.processo.numero),
    PROCESSO_TIPO: e.processo.tipo,
    PROCESSO_TITULO: t(e.processo.titulo),

    ...pessoaNoModelo("ADVOGADO", e.advogado, true),
    ...pessoaNoModelo("TESTEMUNHA1", e.testemunha1),
    ...pessoaNoModelo("TESTEMUNHA2", e.testemunha2),

    DATA: dataCurta(agora),
    DATA_EXTENSO: dataExtenso,
    LOCAL_E_DATA: cheio(emp.endereco.cidade) ? `${emp.endereco.cidade.trim()}, ${dataExtenso}` : dataExtenso,
  };
}

/** Campos de lista: o que vai dentro deles vem de cada sócio. */
const CAMPOS_DE_LISTA = new Set(["SOCIOS", "SOCIOS_QUE_SAIRAM"]);
/** Os campos de dentro da lista, que não se conferem pelo topo dos dados. */
const CAMPOS_DO_SOCIO = new Set(["NOME", "DOCUMENTO", "QUALIFICACAO", "TEXTO", "NACIONALIDADE", "ESTADO_CIVIL", "PROFISSAO", "ENDERECO", "QUOTAS", "CAPITAL", "CAPITAL_EXTENSO", "PERCENTUAL", "ADMINISTRADOR"]);

const DESCRICAO = new Map(CAMPOS.map((c) => [c.nome.replace(/^#/, ""), c.descricao]));

/**
 * Os campos que o modelo usa e vão sair em branco com o cadastro de agora —
 * o aviso antes de gerar ("Falta no cadastro: NIRE, CEP"). A lista de sócios
 * vazia também conta. Não impede gerar: o documento é rascunho para revisar.
 */
export function camposEmBranco(camposDoModelo: string[], dados: DadosDoModelo): string[] {
  const faltas: string[] = [];
  for (const c of camposDoModelo) {
    if (CAMPOS_DO_SOCIO.has(c)) continue;
    const v = dados[c];
    if (v === undefined) continue;
    if (CAMPOS_DE_LISTA.has(c)) {
      if (c === "SOCIOS" && Array.isArray(v) && v.length === 0) faltas.push("Sócios na sociedade");
      continue;
    }
    if (typeof v === "string" && v.trim() === "") faltas.push(DESCRICAO.get(c) ?? c);
  }
  return [...new Set(faltas)];
}

/** "Alteracao_contratual_EMPRESA_EXEMPLO_LTDA_processo-12.docx". */
export function nomeDoArquivoGerado(nomeDoModelo: string, razaoSocial: string, numeroDoProcesso: number): string {
  const seguro = (s: string, max: number) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, max);
  return `${seguro(nomeDoModelo, 60) || "Documento"}_${seguro(razaoSocial, 80).toUpperCase()}_processo-${numeroDoProcesso}.docx`;
}
