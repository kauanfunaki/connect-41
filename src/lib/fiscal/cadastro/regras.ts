// O cadastro fiscal da empresa (27/11/2026, funcionalidade-899): produtos e
// participantes (fornecedores e clientes) que nascem das notas do acervo do
// SPED, e o vínculo do NCM com o cClassTrib do IBS/CBS — os "Arquivos" do
// Domínio Escrita Fiscal. Regra pura, sem banco: o servidor lê o acervo e o
// cadastro e passa para cá.

export type Sentido = "ENTRADA" | "SAIDA";
export type Papel = "FORNECEDOR" | "CLIENTE" | "AMBOS";

export const REGIMES = ["SIMPLES", "MEI", "NORMAL"] as const;
export type Regime = (typeof REGIMES)[number];
export const ROTULO_DO_REGIME: Record<Regime, string> = { SIMPLES: "Simples Nacional", MEI: "MEI", NORMAL: "Regime normal" };

export const CONTRIBUINTE = ["1", "2", "9"] as const;
export const ROTULO_DO_CONTRIBUINTE: Record<(typeof CONTRIBUINTE)[number], string> = {
  "1": "Contribuinte do ICMS",
  "2": "Contribuinte isento",
  "9": "Não contribuinte",
};

/** Origem da mercadoria (tabela A do CST do ICMS). */
export const ORIGENS: Record<string, string> = {
  "0": "0 · Nacional",
  "1": "1 · Estrangeira, importação direta",
  "2": "2 · Estrangeira, mercado interno",
  "3": "3 · Nacional, conteúdo importado > 40%",
  "4": "4 · Nacional, processos básicos",
  "5": "5 · Nacional, conteúdo importado ≤ 40%",
  "6": "6 · Estrangeira, importação direta, sem similar",
  "7": "7 · Estrangeira, mercado interno, sem similar",
  "8": "8 · Nacional, conteúdo importado > 70%",
};

// ─── O que vem do acervo ────────────────────────────────────────────────────

export type ItemDoAcervo = { codigo: string; descricao: string; ncm: string; tipoItem: string };

export type DocumentoDoAcervo = {
  tipo: "NFE" | "NFCE" | "CTE" | "NFSE";
  sentido: Sentido;
  emitente: string;
  nomeEmitente: string;
  destinatario: string;
  nomeDestinatario: string;
  /** "aaaa-mm-dd…" do XML; o que não for data é ignorado. */
  emitidoEm: string;
  cancelado: boolean;
  itens: ItemDoAcervo[];
};

export type ParticipanteAgregado = {
  documento: string;
  nome: string;
  papel: Papel;
  documentos: number;
  primeiraNotaEm: Date | null;
  ultimaNotaEm: Date | null;
};

export type ProdutoAgregado = {
  participanteDocumento: string;
  codigo: string;
  descricao: string;
  ncm: string;
  tipoItem: string;
  sentido: Sentido;
  ocorrencias: number;
  ultimaNotaEm: Date | null;
};

const so = (s: string) => (s ?? "").replace(/\D/g, "");
const chaveDoProduto = (participanteDocumento: string, codigo: string) => `${participanteDocumento}|${codigo}`;

function dataDoXml(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Códigos que o motor inventa para documento sem item de verdade (CT-e, NFS-e, linha analítica do TXT). */
export function ehItemDeVerdade(codigo: string): boolean {
  return !!codigo.trim() && codigo !== "SERVICO" && codigo !== "SERVICO_TRANSPORTE" && !codigo.startsWith("ANALITICO:");
}

const juntarPapel = (a: Papel | undefined, b: Papel): Papel => (!a || a === b ? b : "AMBOS");

/**
 * Junta os documentos do acervo em participantes e produtos. O participante é
 * quem está do outro lado da nota (o emitente na entrada, o destinatário na
 * saída); a própria empresa e documento vazio ficam de fora. O produto vem dos
 * itens de NF-e e NFC-e; nota cancelada não conta. A descrição e o NCM ficam
 * com os da nota mais recente que os traz.
 */
export function agregarDoAcervo(documentos: DocumentoDoAcervo[], cnpjDaEmpresa: string) {
  const propria = so(cnpjDaEmpresa);
  const participantes = new Map<string, ParticipanteAgregado>();
  const produtos = new Map<string, ProdutoAgregado & { _desde: number }>();
  for (const d of documentos) {
    if (d.cancelado) continue;
    const quando = dataDoXml(d.emitidoEm);
    const t = quando?.getTime() ?? 0;
    const outro = d.sentido === "ENTRADA" ? { doc: so(d.emitente), nome: d.nomeEmitente } : { doc: so(d.destinatario), nome: d.nomeDestinatario };
    const papel: Papel = d.sentido === "ENTRADA" ? "FORNECEDOR" : "CLIENTE";
    if ((outro.doc.length === 11 || outro.doc.length === 14) && outro.doc !== propria) {
      const atual = participantes.get(outro.doc);
      if (!atual) {
        participantes.set(outro.doc, { documento: outro.doc, nome: outro.nome.trim() || outro.doc, papel, documentos: 1, primeiraNotaEm: quando, ultimaNotaEm: quando });
      } else {
        atual.papel = juntarPapel(atual.papel, papel);
        atual.documentos++;
        if (quando && (!atual.primeiraNotaEm || quando < atual.primeiraNotaEm)) atual.primeiraNotaEm = quando;
        if (quando && (!atual.ultimaNotaEm || quando > atual.ultimaNotaEm)) {
          atual.ultimaNotaEm = quando;
          if (outro.nome.trim()) atual.nome = outro.nome.trim();
        }
      }
    }
    if (d.tipo !== "NFE" && d.tipo !== "NFCE") continue;
    const participanteDocumento = d.sentido === "ENTRADA" ? so(d.emitente) : "";
    for (const i of d.itens) {
      if (!ehItemDeVerdade(i.codigo)) continue;
      const codigo = i.codigo.trim().slice(0, 120);
      const k = chaveDoProduto(participanteDocumento, codigo);
      const ncm = so(i.ncm).slice(0, 8);
      const atual = produtos.get(k);
      if (!atual) {
        produtos.set(k, {
          participanteDocumento,
          codigo,
          descricao: i.descricao.trim().slice(0, 500) || codigo,
          ncm: ncm.length === 8 ? ncm : "",
          tipoItem: /^\d{2}$/.test(i.tipoItem) ? i.tipoItem : "99",
          sentido: d.sentido,
          ocorrencias: 1,
          ultimaNotaEm: quando,
          _desde: t,
        });
        continue;
      }
      atual.ocorrencias++;
      if (t >= atual._desde) {
        atual._desde = t;
        atual.ultimaNotaEm = quando ?? atual.ultimaNotaEm;
        if (i.descricao.trim()) atual.descricao = i.descricao.trim().slice(0, 500);
        if (ncm.length === 8) atual.ncm = ncm;
      } else if (!atual.ncm && ncm.length === 8) {
        atual.ncm = ncm;
      }
    }
  }
  return {
    participantes: [...participantes.values()],
    produtos: [...produtos.values()].map(({ _desde, ...p }) => (void _desde, p)),
  };
}

// ─── O plano da sincronização ───────────────────────────────────────────────

export type ProdutoNoCadastro = {
  id: string;
  participanteDocumento: string;
  codigo: string;
  descricao: string;
  ncm: string;
  ocorrencias: number;
  ultimaNotaEm: Date | null;
  editadoEm: Date | null;
};

export type ParticipanteNoCadastro = { id: string; documento: string; nome: string; papel: string; documentos: number; ultimaNotaEm: Date | null };

const mesmoInstante = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * O que criar e o que atualizar. Produto editado à mão guarda a descrição e o
 * NCM dele; os números (ocorrências e a nota mais recente) seguem o acervo.
 * Nada é apagado: o que sumiu do acervo continua no cadastro.
 */
export function planejarSincronizacao(
  acervo: ReturnType<typeof agregarDoAcervo>,
  cadastro: { produtos: ProdutoNoCadastro[]; participantes: ParticipanteNoCadastro[] }
) {
  const produtosAtuais = new Map(cadastro.produtos.map((p) => [chaveDoProduto(p.participanteDocumento, p.codigo), p]));
  const participantesAtuais = new Map(cadastro.participantes.map((p) => [p.documento, p]));

  const produtosNovos: ProdutoAgregado[] = [];
  const produtosMudados: { id: string; dados: Partial<Pick<ProdutoAgregado, "descricao" | "ncm" | "ocorrencias" | "ultimaNotaEm">> }[] = [];
  for (const p of acervo.produtos) {
    const atual = produtosAtuais.get(chaveDoProduto(p.participanteDocumento, p.codigo));
    if (!atual) {
      produtosNovos.push(p);
      continue;
    }
    const dados: Partial<Pick<ProdutoAgregado, "descricao" | "ncm" | "ocorrencias" | "ultimaNotaEm">> = {};
    if (!atual.editadoEm) {
      if (p.descricao !== atual.descricao) dados.descricao = p.descricao;
      if (p.ncm && p.ncm !== atual.ncm) dados.ncm = p.ncm;
    }
    if (p.ocorrencias !== atual.ocorrencias) dados.ocorrencias = p.ocorrencias;
    if (!mesmoInstante(p.ultimaNotaEm, atual.ultimaNotaEm)) dados.ultimaNotaEm = p.ultimaNotaEm;
    if (Object.keys(dados).length > 0) produtosMudados.push({ id: atual.id, dados });
  }

  const participantesNovos: ParticipanteAgregado[] = [];
  const participantesMudados: { id: string; dados: Partial<ParticipanteAgregado> }[] = [];
  for (const p of acervo.participantes) {
    const atual = participantesAtuais.get(p.documento);
    if (!atual) {
      participantesNovos.push(p);
      continue;
    }
    const dados: Partial<ParticipanteAgregado> = {};
    if (p.nome !== atual.nome) dados.nome = p.nome;
    const papel = juntarPapel(atual.papel as Papel, p.papel);
    if (papel !== atual.papel) dados.papel = papel;
    if (p.documentos !== atual.documentos) dados.documentos = p.documentos;
    if (!mesmoInstante(p.ultimaNotaEm, atual.ultimaNotaEm)) {
      dados.ultimaNotaEm = p.ultimaNotaEm;
      dados.primeiraNotaEm = p.primeiraNotaEm;
    }
    if (Object.keys(dados).length > 0) participantesMudados.push({ id: atual.id, dados });
  }
  return { produtosNovos, produtosMudados, participantesNovos, participantesMudados };
}

// ─── IBS/CBS ────────────────────────────────────────────────────────────────

export type CClassTribEfetivo = { cClassTrib: string; cst: string | null; fonte: "PRODUTO" | "NCM" } | null;

/** O cClassTrib do produto: o dele, ou o do vínculo do NCM. */
export function cClassTribEfetivo(
  produto: { ncm: string; cClassTrib: string | null; cstIbsCbs: string | null },
  vinculos: ReadonlyMap<string, { cClassTrib: string; cstIbsCbs: string | null }>
): CClassTribEfetivo {
  if (produto.cClassTrib) return { cClassTrib: produto.cClassTrib, cst: produto.cstIbsCbs, fonte: "PRODUTO" };
  const v = produto.ncm ? vinculos.get(produto.ncm) : undefined;
  return v ? { cClassTrib: v.cClassTrib, cst: v.cstIbsCbs, fonte: "NCM" } : null;
}

// ─── Campos editáveis ───────────────────────────────────────────────────────

export type EdicaoDoProduto = {
  descricao?: string;
  ncm?: string;
  cest?: string | null;
  unidade?: string | null;
  grupo?: string | null;
  origem?: string | null;
  tipoItem?: string;
  cClassTrib?: string | null;
  cstIbsCbs?: string | null;
};

type Leitura<T> = { ok: true; valor: T } | { ok: false; erro: string };

/**
 * Lê os campos do produto. `emLote`: campo vazio não mexe (fica como está em
 * cada produto) e só "—" limpa; fora do lote, vazio limpa. Descrição e NCM não
 * se editam em lote — são do produto.
 */
export function lerEdicaoDoProduto(form: FormData, emLote: boolean): Leitura<EdicaoDoProduto> {
  const r: EdicaoDoProduto = {};
  const campo = (nome: string) => {
    const bruto = form.get(nome);
    if (bruto === null) return undefined;
    const v = String(bruto).trim();
    if (emLote) {
      if (v === "") return undefined;
      if (v === "—" || v === "-") return null;
    }
    return v === "" ? null : v;
  };
  if (!emLote) {
    const descricao = campo("descricao");
    if (descricao !== undefined) {
      if (!descricao) return { ok: false, erro: "A descrição não pode ficar vazia." };
      r.descricao = descricao.slice(0, 500);
    }
    const ncm = campo("ncm");
    if (ncm !== undefined) {
      const d = (ncm ?? "").replace(/\D/g, "");
      if (d && d.length !== 8) return { ok: false, erro: "O NCM tem 8 números." };
      r.ncm = d;
    }
  }
  const cest = campo("cest");
  if (cest !== undefined) {
    const d = cest === null ? null : cest.replace(/\D/g, "");
    if (d && d.length !== 7) return { ok: false, erro: "O CEST tem 7 números." };
    r.cest = d || null;
  }
  const unidade = campo("unidade");
  if (unidade !== undefined) r.unidade = unidade ? unidade.toUpperCase().slice(0, 6) : null;
  const grupo = campo("grupo");
  if (grupo !== undefined) r.grupo = grupo ? grupo.slice(0, 60) : null;
  const origem = campo("origem");
  if (origem !== undefined) {
    if (origem !== null && !(origem in ORIGENS)) return { ok: false, erro: "Origem de 0 a 8." };
    r.origem = origem;
  }
  const tipoItem = campo("tipoItem");
  if (tipoItem !== undefined && tipoItem !== null) {
    if (!/^\d{2}$/.test(tipoItem)) return { ok: false, erro: "O tipo do item tem 2 números (00 a 99)." };
    r.tipoItem = tipoItem;
  }
  const cClassTrib = campo("cClassTrib");
  if (cClassTrib !== undefined) {
    const d = cClassTrib === null ? null : cClassTrib.replace(/\D/g, "");
    if (d && d.length !== 6) return { ok: false, erro: "O cClassTrib tem 6 números." };
    r.cClassTrib = d || null;
  }
  const cst = campo("cstIbsCbs");
  if (cst !== undefined) {
    const d = cst === null ? null : cst.replace(/\D/g, "");
    if (d && d.length !== 3) return { ok: false, erro: "O CST de IBS/CBS tem 3 números." };
    r.cstIbsCbs = d || null;
  }
  if (emLote && Object.keys(r).length === 0) return { ok: false, erro: "Preencha ao menos um campo para mudar." };
  return { ok: true, valor: r };
}

export type VinculoDoNcm = { ncm: string; cClassTrib: string; cstIbsCbs: string | null; observacao: string | null };

export function lerVinculoDoNcm(form: FormData): Leitura<VinculoDoNcm> {
  const ncm = String(form.get("ncm") ?? "").replace(/\D/g, "");
  const cClassTrib = String(form.get("cClassTrib") ?? "").replace(/\D/g, "");
  const cst = String(form.get("cstIbsCbs") ?? "").replace(/\D/g, "");
  const observacao = String(form.get("observacao") ?? "").trim().slice(0, 200) || null;
  if (ncm.length !== 8) return { ok: false, erro: "O NCM tem 8 números." };
  if (cClassTrib.length !== 6) return { ok: false, erro: "O cClassTrib tem 6 números." };
  if (cst && cst.length !== 3) return { ok: false, erro: "O CST de IBS/CBS tem 3 números." };
  return { ok: true, valor: { ncm, cClassTrib, cstIbsCbs: cst || null, observacao } };
}

export type EdicaoDoParticipante = { nome: string; uf: string | null; inscricaoEstadual: string | null; regime: Regime | null; contribuinteIcms: string | null };

export function lerEdicaoDoParticipante(form: FormData): Leitura<EdicaoDoParticipante> {
  const nome = String(form.get("nome") ?? "").trim().slice(0, 180);
  const uf = String(form.get("uf") ?? "").trim().toUpperCase() || null;
  const ie = String(form.get("inscricaoEstadual") ?? "").trim().toUpperCase().slice(0, 30) || null;
  const regime = String(form.get("regime") ?? "").trim() || null;
  const contribuinte = String(form.get("contribuinteIcms") ?? "").trim() || null;
  if (!nome) return { ok: false, erro: "Informe o nome." };
  if (uf && !/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: "A UF tem duas letras." };
  if (regime && !(REGIMES as readonly string[]).includes(regime)) return { ok: false, erro: "Regime inválido." };
  if (contribuinte && !(CONTRIBUINTE as readonly string[]).includes(contribuinte)) return { ok: false, erro: "Indicador de contribuinte inválido." };
  return { ok: true, valor: { nome, uf, inscricaoEstadual: ie, regime: regime as Regime | null, contribuinteIcms: contribuinte } };
}

/** "84713012" → "8471.30.12". */
export function formatarNcm(ncm: string): string {
  return /^\d{8}$/.test(ncm) ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : ncm;
}
