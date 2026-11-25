// O de-para do cliente: a leitura da planilha e o plano do que gravar
// (25/11/2026, funcionalidade-837).
//
// A planilha tem duas ou três colunas: a categoria no Omie, a categoria do
// cliente e, se quiser, a linha do fluxo. É o formato das abas de categorias
// que os clientes do BPO já mantêm (a de um deles tem o cabeçalho "Categoria
// <cliente> | Categoria OMIE", nessa ordem), então a leitura acha as colunas
// pelo cabeçalho; sem cabeçalho reconhecível, vale A = Omie, B = cliente,
// C = linha.
//
// `planejarDePara` não grava nada: diz o que a confirmação vai fazer, para a
// prévia mostrar e o servidor aplicar. A mesma função serve o "copiar de outra
// empresa", com as linhas montadas a partir do de-para da outra.
//
// Puro.

import { chaveDeTexto, linhaDeTexto } from "./estrutura";
import { sugerirLinha } from "./sugestao";

/** O limite de `ClientCategory.name`, o mesmo das categorias do plano. */
export const MAX_NOME_DO_CLIENTE = 120;
/** Mais que isso não é de-para de categorias: é outra planilha. */
export const MAXIMO_DE_LINHAS_DO_DE_PARA = 3000;

export type LinhaDoDePara = {
  /** O número da linha na planilha, para a prévia apontar. */
  linha: number;
  omie: string;
  cliente: string;
  /** O texto da coluna da linha do fluxo, quando a planilha tem. */
  linhaDoFluxo: string | null;
};

/**
 * "ligacoes": categoria do Omie → categoria do cliente (e, se tiver, a linha).
 * "linhas": categoria do cliente → linha do fluxo, sem a do Omie. Os clientes
 * costumam ter as duas tabelas separadas (a de categorias e a do DFC); a
 * equipe importa uma e depois a outra, sem juntar à mão.
 */
export type ModoDoDePara = "ligacoes" | "linhas";

export type LeituraDoDePara = { ok: true; modo: ModoDoDePara; linhas: LinhaDoDePara[] } | { ok: false; erro: string };

type Celula = string | number | boolean | Date | null | undefined | { text?: unknown; result?: unknown; richText?: { text: string }[] };

/** O texto da célula, do jeito que o exceljs ou o CSV entregam. */
export function textoDaCelula(c: Celula): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "string") return c.trim();
  if (typeof c === "number" || typeof c === "boolean") return String(c);
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  if (Array.isArray(c.richText)) return c.richText.map((p) => p.text).join("").trim();
  if (c.text !== undefined) return String(c.text).trim();
  if (c.result !== undefined && c.result !== null) return String(c.result).trim();
  return "";
}

type Colunas = { omie: number | null; cliente: number; linha: number | null };

/** O índice da primeira coluna que casa, em ordem de preferência dos testes. */
function primeiraQue(k: string[], testes: ((t: string) => boolean)[], fora: number[]): number {
  for (const teste of testes) {
    const i = k.findIndex((t, j) => !fora.includes(j) && teste(t));
    if (i !== -1) return i;
  }
  return -1;
}

/** As colunas pelo cabeçalho, ou nulo quando a primeira linha não é cabeçalho. */
function colunasDoCabecalho(cabecalho: string[]): Colunas | null {
  const k = cabecalho.map(chaveDeTexto);
  const omie = k.findIndex((t) => t.includes("omie"));
  // "Subgrupo DFC (linha do fluxo)" ganha de "Grupo DFC" (Operacional/…).
  const linha = primeiraQue(
    k,
    [(t) => t.includes("linha") || t.includes("subgrupo") || t.includes("fluxo"), (t) => t.includes("dfc"), (t) => t.includes("grupo")],
    [omie]
  );
  const cliente = primeiraQue(k, [(t) => t.includes("cliente") || t.includes("categoria") || t.includes("nomenclatura")], [omie, linha]);
  if (cliente === -1) return null;
  if (omie === -1) return linha === -1 ? null : { omie: null, cliente, linha };
  return { omie, cliente, linha: linha === -1 ? null : linha };
}

/**
 * Lê a matriz (a primeira aba do xlsx, ou o CSV) e devolve as linhas com as
 * duas categorias preenchidas. Linha com só uma das duas fica de fora em
 * silêncio quando é a de categoria vazia (fim de bloco, subtotal), e aparece
 * na prévia quando tem a do Omie sem a do cliente — ver `planejarDePara`.
 */
export function lerDePara(matriz: Celula[][]): LeituraDoDePara {
  const linhas = matriz.map((r) => r.map(textoDaCelula));
  const primeira = linhas.findIndex((r) => r.some((c) => c !== ""));
  if (primeira === -1) return { ok: false, erro: "A planilha está vazia." };

  const doCabecalho = colunasDoCabecalho(linhas[primeira]!);
  const colunas: Colunas = doCabecalho ?? { omie: 0, cliente: 1, linha: linhas[primeira]!.length > 2 ? 2 : null };
  const inicio = doCabecalho ? primeira + 1 : primeira;

  const modo: ModoDoDePara = colunas.omie === null ? "linhas" : "ligacoes";

  const saida: LinhaDoDePara[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const r = linhas[i]!;
    const omie = colunas.omie === null ? "" : (r[colunas.omie] ?? "");
    const cliente = r[colunas.cliente] ?? "";
    const linhaDoFluxo = colunas.linha === null ? null : (r[colunas.linha] ?? "") || null;
    if (!omie && !cliente && !linhaDoFluxo) continue;
    saida.push({ linha: i + 1, omie, cliente, linhaDoFluxo });
    if (saida.length > MAXIMO_DE_LINHAS_DO_DE_PARA) {
      return { ok: false, erro: `A planilha passa de ${MAXIMO_DE_LINHAS_DO_DE_PARA} linhas. Confira se é o de-para de categorias.` };
    }
  }
  if (saida.length === 0) return { ok: false, erro: "Não achei nenhuma linha com categoria do Omie e categoria do cliente." };
  return { ok: true, modo, linhas: saida };
}

// ─── O plano ────────────────────────────────────────────────────────────────

export type CategoriaDoPlano = {
  id: string;
  name: string;
  kind: "PAGAR" | "RECEBER";
  omieCode: string | null;
  /** Nulo = do plano padrão do escritório. */
  companyId: string | null;
};

export type CategoriaDoClienteExistente = { id: string; name: string; line: string };

/** O de-para gravado hoje: categoria do Omie → categoria do cliente. */
export type LigacaoExistente = { categoryId: string; clientCategoryId: string };

export type PlanoDoDePara = {
  /** Categorias do cliente que nascem, com a linha. */
  novas: { nome: string; linha: string; linhaSugerida: boolean }[];
  /** Categorias do cliente que já existem e mudam de linha (a planilha disse outra). */
  mudamDeLinha: { id: string; nome: string; de: string; para: string }[];
  /** As ligações a gravar, pelo nome da categoria do cliente (que pode ser nova). */
  ligacoes: { categoryId: string; categoria: string; kind: "PAGAR" | "RECEBER"; cliente: string; muda: boolean }[];
  /** Linhas cuja categoria do Omie não está no plano da empresa. */
  semPar: { linha: number; omie: string }[];
  /** Linhas que não dá para usar, com o motivo. */
  invalidas: { linha: number; texto: string; motivo: string }[];
  /** Categorias do Omie ligadas a mais de uma categoria do cliente na planilha: vale a primeira. */
  repetidas: { linha: number; omie: string }[];
};

/**
 * O que a importação vai fazer. A categoria do Omie casa pelo código do Omie
 * ou pelo nome (sem caixa, acento e espaço). Um nome que existe dos dois lados
 * (a pagar e a receber) liga os dois: o de-para dos clientes é por nome.
 *
 * A linha da categoria do cliente: a da planilha; senão a que ela já tem;
 * senão a sugerida pelo nome e pelo lado da primeira categoria ligada.
 */
export function planejarDePara(
  linhas: LinhaDoDePara[],
  plano: CategoriaDoPlano[],
  existentes: CategoriaDoClienteExistente[],
  ligacoesAtuais: LigacaoExistente[],
  modo: ModoDoDePara = "ligacoes"
): PlanoDoDePara {
  const porCodigo = new Map<string, CategoriaDoPlano[]>();
  const porNome = new Map<string, CategoriaDoPlano[]>();
  for (const c of plano) {
    if (c.omieCode) porCodigo.set(c.omieCode.trim(), [...(porCodigo.get(c.omieCode.trim()) ?? []), c]);
    const k = chaveDeTexto(c.name);
    porNome.set(k, [...(porNome.get(k) ?? []), c]);
  }
  const existentePorChave = new Map(existentes.map((e) => [chaveDeTexto(e.name), e]));
  const clienteAtualDe = new Map(ligacoesAtuais.map((l) => [l.categoryId, l.clientCategoryId]));
  const nomeDoCliente = new Map(existentes.map((e) => [e.id, chaveDeTexto(e.name)]));

  const plano_: PlanoDoDePara = { novas: [], mudamDeLinha: [], ligacoes: [], semPar: [], invalidas: [], repetidas: [] };
  /** Linha escolhida por categoria do cliente (pela chave do nome), a primeira que a planilha disse. */
  const linhaDoCliente = new Map<string, { nome: string; linha: string | null; linhaDaPlanilha: boolean }>();
  const jaLigadas = new Set<string>();

  for (const l of linhas) {
    const cliente = l.cliente.replace(/\s+/g, " ").trim();
    if (modo === "linhas") {
      // Só a linha de cada categoria do cliente: a primeira da planilha vale.
      const linha = l.linhaDoFluxo ? linhaDeTexto(l.linhaDoFluxo) : null;
      if (!cliente) plano_.invalidas.push({ linha: l.linha, texto: l.linhaDoFluxo ?? "", motivo: "sem a categoria do cliente" });
      else if (cliente.length > MAX_NOME_DO_CLIENTE) plano_.invalidas.push({ linha: l.linha, texto: cliente, motivo: `nome com mais de ${MAX_NOME_DO_CLIENTE} letras` });
      else if (!l.linhaDoFluxo) plano_.invalidas.push({ linha: l.linha, texto: cliente, motivo: "sem a linha do fluxo" });
      else if (!linha) plano_.invalidas.push({ linha: l.linha, texto: l.linhaDoFluxo, motivo: "linha do fluxo que não reconheço" });
      else if (!linhaDoCliente.has(chaveDeTexto(cliente))) linhaDoCliente.set(chaveDeTexto(cliente), { nome: cliente, linha, linhaDaPlanilha: true });
      continue;
    }
    if (!l.omie) {
      plano_.invalidas.push({ linha: l.linha, texto: cliente, motivo: "sem a categoria do Omie" });
      continue;
    }
    if (!cliente) {
      plano_.invalidas.push({ linha: l.linha, texto: l.omie, motivo: "sem a categoria do cliente" });
      continue;
    }
    if (cliente.length > MAX_NOME_DO_CLIENTE) {
      plano_.invalidas.push({ linha: l.linha, texto: cliente, motivo: `nome com mais de ${MAX_NOME_DO_CLIENTE} letras` });
      continue;
    }
    let linhaDaPlanilha: string | null = null;
    if (l.linhaDoFluxo) {
      linhaDaPlanilha = linhaDeTexto(l.linhaDoFluxo);
      if (!linhaDaPlanilha) {
        plano_.invalidas.push({ linha: l.linha, texto: l.linhaDoFluxo, motivo: "linha do fluxo que não reconheço" });
        continue;
      }
    }

    const casadas = porCodigo.get(l.omie.trim()) ?? porNome.get(chaveDeTexto(l.omie)) ?? [];
    if (casadas.length === 0) {
      plano_.semPar.push({ linha: l.linha, omie: l.omie });
      continue;
    }

    const kCliente = chaveDeTexto(cliente);
    const atual = linhaDoCliente.get(kCliente);
    if (!atual) linhaDoCliente.set(kCliente, { nome: cliente, linha: linhaDaPlanilha, linhaDaPlanilha: linhaDaPlanilha !== null });
    else if (atual.linha === null && linhaDaPlanilha) linhaDoCliente.set(kCliente, { ...atual, linha: linhaDaPlanilha, linhaDaPlanilha: true });

    for (const c of casadas) {
      if (jaLigadas.has(c.id)) {
        plano_.repetidas.push({ linha: l.linha, omie: l.omie });
        continue;
      }
      jaLigadas.add(c.id);
      const atualId = clienteAtualDe.get(c.id);
      const muda = !atualId || nomeDoCliente.get(atualId) !== kCliente;
      plano_.ligacoes.push({ categoryId: c.id, categoria: c.name, kind: c.kind, cliente: atual?.nome ?? cliente, muda });
    }
  }

  for (const [k, v] of linhaDoCliente) {
    const existente = existentePorChave.get(k);
    if (existente) {
      if (v.linha && v.linha !== existente.line) {
        plano_.mudamDeLinha.push({ id: existente.id, nome: existente.name, de: existente.line, para: v.linha });
      }
      continue;
    }
    const primeira = plano_.ligacoes.find((x) => chaveDeTexto(x.cliente) === k);
    plano_.novas.push({
      nome: v.nome,
      linha: v.linha ?? sugerirLinha(v.nome, primeira?.kind ?? "PAGAR"),
      linhaSugerida: v.linha === null,
    });
  }
  return plano_;
}

/** Resumo de uma frase para a prévia e para a auditoria. */
export function resumoDoPlano(p: PlanoDoDePara): { ligacoes: number; mudam: number; novas: number; mudamDeLinha: number; semPar: number; invalidas: number } {
  return {
    ligacoes: p.ligacoes.length,
    mudam: p.ligacoes.filter((l) => l.muda).length,
    novas: p.novas.length,
    mudamDeLinha: p.mudamDeLinha.length,
    semPar: p.semPar.length,
    invalidas: p.invalidas.length,
  };
}
