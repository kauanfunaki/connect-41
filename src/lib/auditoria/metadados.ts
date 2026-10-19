// O que os detalhes (`metadata`) de uma linha da auditoria dizem, para gente:
// o "de → para" quando a ação guardou, os poucos fatos que cabem na linha
// ("motivo: lançamento duplicado") e o registro completo, para quem quer
// conferir tudo.
//
// As formas do "de → para" são as que o código grava hoje (levantamento de
// 14/10/2026):
// - `{ de, para }` com valor simples — renomear pasta, trocar setor, destino
//   do documento fiscal, situação da solicitação/pendência/processo/lead;
// - `{ de: {…}, para: {…} }` — pasta do modelo, quem recebe as autorizações;
// - `{ antes: {…}, depois: {…} }` — documento fiscal corrigido, acesso ao
//   portal, centro de custo;
// - `{ campo: { de, para } }` dentro dos detalhes — o centro padrão do fornecedor;
// - `deCliente`/`paraCliente` e `nomeAnterior`/`nome` — acesso ao portal que
//   trocou de cliente.
//
// Puro, sem banco: os nomes de ids (pasta, usuário, centro de custo, setor)
// chegam prontos em `nomes`.

import { ROLE_LABELS } from "@/lib/roles";

export type Mudanca = { campo: string; de: string | null; para: string | null };

/** id (ou código de setor) → nome, para os valores que são referência. */
export type Nomes = ReadonlyMap<string, string>;

const SEM_NOMES: Nomes = new Map();

type Objeto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Objeto {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O nome do campo dos `{ de, para }` simples, pela ação. */
const CAMPO_DO_DE_PARA: Readonly<Record<string, string>> = {
  "drive.folder_rename": "Nome",
  "drive.file_rename": "Nome",
  "drive.folder_sector": "Setor",
  "drive.folder_move": "Pasta",
  "drive.file_move": "Pasta",
  "lead.situacao": "Situação",
  "lead.responsavel": "Responsável",
  "fiscal.document.destination": "Destino",
  "solicitacao.encaminhada": "Setor",
  "finance.cost_center_set": "Centro de custo",
  "ia.chat.encaminhada": "Encaminhada",
  "ia.chat.sem_ia": "Encaminhada",
};

function campoDoDePara(acao: string): string {
  if (CAMPO_DO_DE_PARA[acao]) return CAMPO_DO_DE_PARA[acao];
  if (/^(solicitacao|financeiro\.client_request|societario\.processo|autorizacoes)\./.test(acao)) return "Situação";
  return "Valor";
}

/** Os nomes das chaves dos objetos de antes/depois. */
const NOME_DO_CAMPO: Readonly<Record<string, string>> = {
  nome: "Nome",
  name: "Nome",
  label: "Nome",
  title: "Título",
  titulo: "Título",
  setor: "Setor",
  sectorCode: "Setor",
  email: "E-mail",
  codigo: "Código",
  code: "Código",
  ativo: "Ativo",
  active: "Ativo",
  cliente: "Cliente",
  number: "Número",
  numero: "Número",
  series: "Série",
  serie: "Série",
  issuerName: "Emitente",
  recipientName: "Destinatário",
  amount: "Valor",
  valor: "Valor",
  issuedAt: "Emissão",
  competence: "Competência",
  competencia: "Competência",
  companyId: "Empresa",
  cnpj: "CNPJ",
  status: "Situação",
  role: "Papel",
  papel: "Papel",
  centroPadrao: "Centro de custo padrão",
  responsavel: "Responsável",
  destino: "Destino",
  basePrice: "Valor",
  pricePerUser: "Valor por usuário",
  setupFee: "Implantação",
  linhaDaDre: "Linha da DRE",
  // A edição de lançamento (19/10) grava o antes e o depois pelas colunas.
  counterpartyId: "Contraparte",
  categoryId: "Categoria",
  costCenterId: "Centro de custo",
  projectId: "Projeto",
  issueDate: "Emissão",
  documentNumber: "Nº do documento",
  dueDate: "Vencimento",
  description: "Descrição",
  fichaAlterada: "Campos da ficha alterados",
};

/** "issuerDocument" → "Issuer document" — só para chave sem nome conhecido. */
function nomeDoCampo(chave: string): string {
  if (NOME_DO_CAMPO[chave]) return NOME_DO_CAMPO[chave];
  const solto = chave.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return solto.charAt(0).toUpperCase() + solto.slice(1);
}

/** Situações que o sistema grava em inglês ou sem acento. */
const VALORES: Readonly<Record<string, string>> = {
  REQUESTED: "Pedida ao cliente",
  PENDING_VALIDATION: "Aguardando validação",
  ACTIVE: "Ativa",
  CANCELLED: "Cancelada",
  NOT_APPLICABLE: "Não se aplica",
  GOOGLE: "Google",
  MICROSOFT: "Microsoft",
  PAGAR: "A pagar",
  RECEBER: "A receber",
};

const COM_ACENTO: Readonly<Record<string, string>> = {
  lancado: "lançado",
  lancada: "lançada",
  concluida: "concluída",
  concluido: "concluído",
  exigencia: "exigência",
  analise: "análise",
  negociacao: "negociação",
  aprovacao: "aprovação",
  situacao: "situação",
  orgao: "órgão",
  nao: "não",
  reuniao: "reunião",
  contratacao: "contratação",
  validacao: "validação",
  pendencia: "pendência",
};

/** "AGUARDANDO_CLIENTE" → "Aguardando cliente"; "LANCADO" → "Lançado". */
function enumLegivel(v: string): string {
  if (VALORES[v]) return VALORES[v];
  const palavras = v.toLowerCase().split("_").map((p) => COM_ACENTO[p] ?? p);
  const t = palavras.join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Chaves que guardam valor em reais (texto "1200.50" ou número). */
const DINHEIRO = new Set(["amount", "valor", "basePrice", "pricePerUser", "setupFee"]);

function ehDinheiro(chave: string | null): boolean {
  return chave !== null && DINHEIRO.has(chave);
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Um valor dos detalhes como texto para a tela; `null` é "vazio". */
export function valorLegivel(v: unknown, chave: string | null = null, nomes: Nomes = SEM_NOMES): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") {
    if (ehDinheiro(chave)) return REAIS.format(v);
    return new Intl.NumberFormat("pt-BR").format(v);
  }
  if (Array.isArray(v)) {
    const itens = v.map((i) => valorLegivel(i, chave, nomes)).filter((i): i is string => i !== null);
    return itens.length ? itens.join(", ") : null;
  }
  if (ehObjeto(v)) {
    const nome = v.nome ?? v.name ?? v.label ?? v.title;
    if (typeof nome === "string" && nome) return nome;
    if (typeof v.id === "string") return nomes.get(v.id) ?? null;
    return null;
  }
  const s = String(v);
  if (nomes.has(s)) return nomes.get(s)!;
  if (UUID.test(s)) return "(não existe mais)";
  if ((ehDinheiro(chave)) && /^-?\d+(\.\d+)?$/.test(s)) return REAIS.format(Number(s));
  if ((chave === "role" || chave === "papel") && s in ROLE_LABELS) return ROLE_LABELS[s as keyof typeof ROLE_LABELS];
  const data = s.match(/^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+Z?)?$/);
  if (data) return `${data[3]}/${data[2]}/${data[1]}`;
  const mes = s.match(/^(\d{4})-(\d{2})$/);
  if (mes) return `${mes[2]}/${mes[1]}`;
  if (/^[A-Z][A-Z0-9_]+$/.test(s)) return enumLegivel(s);
  return s;
}

function compararObjetos(antes: Objeto, depois: Objeto, nomes: Nomes): Mudanca[] {
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
  const out: Mudanca[] = [];
  for (const k of chaves) {
    if (k === "id") continue;
    const de = valorLegivel(antes[k], k, nomes);
    const para = valorLegivel(depois[k], k, nomes);
    if (de !== para) out.push({ campo: nomeDoCampo(k), de, para });
  }
  return out;
}

const MAXIMO = 12;

/** A seta das mudanças guardadas em texto ("Básico → Essencial"). */
const SETA = " → ";

/**
 * O "de → para" de uma linha da auditoria. Vazio quando a ação não guardou
 * mudança — a maioria das ações guarda só o nome ou uma contagem.
 */
export function mudancasDoRegistro(acao: string, metadata: unknown, nomes: Nomes = SEM_NOMES): Mudanca[] {
  if (!ehObjeto(metadata)) return [];
  const m = metadata;
  const out: Mudanca[] = [];

  if ("de" in m && "para" in m) {
    const { de, para } = m;
    if ((ehObjeto(de) || de === null) && ehObjeto(para)) out.push(...compararObjetos(de ?? {}, para, nomes));
    else if (!ehObjeto(de) && !ehObjeto(para) && !Array.isArray(de) && !Array.isArray(para)) {
      const campo = campoDoDePara(acao);
      const chave = campo === "Setor" ? "setor" : null;
      const a = valorLegivel(de, chave, nomes);
      const b = valorLegivel(para, chave, nomes);
      if (a !== b) out.push({ campo, de: a, para: b });
    }
  }

  if (ehObjeto(m.antes) && ehObjeto(m.depois)) out.push(...compararObjetos(m.antes, m.depois, nomes));

  if (ehObjeto(m.deCliente) || ehObjeto(m.paraCliente)) {
    const a = valorLegivel(m.deCliente, null, nomes);
    const b = valorLegivel(m.paraCliente, null, nomes);
    if (a !== b) out.push({ campo: "Cliente", de: a, para: b });
  }
  if (typeof m.nomeAnterior === "string" && typeof m.nome === "string" && m.nomeAnterior !== m.nome) {
    out.push({ campo: "Nome", de: m.nomeAnterior, para: m.nome });
  }

  // `{ centroPadrao: { de, para } }` e afins: um campo que guardou a própria mudança.
  // E `{ basePrice: "100.00 → 120.00" }`: a edição do plano (PR #192) guarda a
  // mudança já em texto, uma chave por campo.
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === "string" && v.includes(SETA)) {
      const [a, b] = v.split(SETA);
      const de = valorLegivel(a.trim(), k, nomes);
      const para = valorLegivel(b.trim(), k, nomes);
      if (de !== para) out.push({ campo: nomeDoCampo(k), de, para });
      continue;
    }
    if (k === "de" || k === "para" || k === "antes" || k === "depois" || !ehObjeto(v)) continue;
    if ("de" in v && "para" in v && !ehObjeto(v.de) && !ehObjeto(v.para)) {
      const a = valorLegivel(v.de, k, nomes);
      const b = valorLegivel(v.para, k, nomes);
      if (a !== b) out.push({ campo: nomeDoCampo(k), de: a, para: b });
    }
  }

  return out.slice(0, MAXIMO);
}

/** Os ids que os detalhes citam e que viram nome na tela (pasta de/para, responsável, centro de custo). */
export function idsCitados(metadata: unknown): string[] {
  const ids = new Set<string>();
  const visitar = (v: unknown, fundo: number) => {
    if (fundo > 3) return;
    if (typeof v === "string" && UUID.test(v)) ids.add(v);
    else if (Array.isArray(v)) v.slice(0, 20).forEach((i) => visitar(i, fundo + 1));
    else if (ehObjeto(v)) Object.values(v).forEach((i) => visitar(i, fundo + 1));
  };
  visitar(metadata, 0);
  return [...ids];
}

// ─── Os fatos curtos da linha ────────────────────────────────────────────────

/** As chaves que cabem na linha, com o nome que a tela mostra. O resto fica no registro completo. */
const FATOS: ReadonlyArray<readonly [string, string]> = [
  ["motivo", "motivo"],
  ["tela", "tela"],
  ["setor", "setor"],
  ["desfecho", "desfecho"],
  ["email", "e-mail"],
  ["role", "papel"],
  ["papel", "papel"],
  ["provider", "conta"],
  ["arquivo", "arquivo"],
  ["valor", "valor"],
  ["competencia", "competência"],
  ["year", "ano"],
  ["ano", "ano"],
  ["imported", "importados"],
  ["total", "total"],
  ["removido", "saiu junto"],
];

export type Fato = { rotulo: string; valor: string };

/**
 * Até três fatos curtos para a linha ("motivo: lançamento duplicado"). A chave
 * que já virou o nome do cadastro na frase não se repete.
 */
export function fatosDoRegistro(metadata: unknown, nomes: Nomes = SEM_NOMES, jaNaFrase: string | null = null): Fato[] {
  if (!ehObjeto(metadata)) return [];
  const out: Fato[] = [];
  for (const [chave, rotulo] of FATOS) {
    if (chave === jaNaFrase || !(chave in metadata)) continue;
    const bruto = metadata[chave];
    if (ehObjeto(bruto)) continue;
    const v = valorLegivel(bruto, chave, nomes);
    if (v && v.length <= 140) out.push({ rotulo, valor: v });
    if (out.length === 3) break;
  }
  return out;
}

/** O nome do cadastro que os detalhes guardaram — o que sobra quando o cadastro já não existe. */
export function nomeNosDetalhes(metadata: unknown, chaveDoNome?: string): string | null {
  if (!ehObjeto(metadata)) return null;
  const chaves = chaveDoNome ? [chaveDoNome] : ["nome", "name", "title", "label"];
  for (const k of chaves) {
    const v = metadata[k];
    // "Básico → Essencial" (o nome que mudou): vale o novo.
    if (typeof v === "string" && v.trim()) return (v.includes(SETA) ? v.split(SETA)[1] : v).trim() || null;
  }
  // Edição de pasta do modelo: o nome novo está no "para" (ou no "depois").
  for (const k of ["para", "depois"]) {
    const o = metadata[k];
    if (ehObjeto(o)) {
      const v = o.nome ?? o.name;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

/** O id da empresa que os detalhes citam (lançamentos, pastas, orçamentos guardam `companyId`). */
export function empresaNosDetalhes(metadata: unknown): string | null {
  if (!ehObjeto(metadata)) return null;
  const v = metadata.companyId;
  return typeof v === "string" && v ? v : null;
}

// ─── O registro completo ─────────────────────────────────────────────────────

export type LinhaDoRegistro = { chave: string; valor: string };

/**
 * Tudo o que a linha guardou, achatado em "chave: valor" — para o bloco
 * "Registro completo", que abre fechado. Listas grandes viram a contagem.
 */
export function registroCompleto(metadata: unknown): LinhaDoRegistro[] {
  const out: LinhaDoRegistro[] = [];
  const visitar = (v: unknown, caminho: string, fundo: number) => {
    if (out.length >= 60) return;
    if (ehObjeto(v) && fundo < 3) {
      for (const [k, i] of Object.entries(v)) visitar(i, caminho ? `${caminho}.${k}` : k, fundo + 1);
      return;
    }
    if (Array.isArray(v)) {
      const simples = v.every((i) => !ehObjeto(i) && !Array.isArray(i));
      out.push({ chave: caminho, valor: simples && v.length <= 10 ? v.map(String).join(", ") : `${v.length} ${v.length === 1 ? "item" : "itens"}` });
      return;
    }
    if (v === null || v === undefined || v === "") return;
    out.push({ chave: caminho || "valor", valor: ehObjeto(v) ? JSON.stringify(v) : String(v) });
  };
  visitar(metadata, "", 0);
  return out;
}
