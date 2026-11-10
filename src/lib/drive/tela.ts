// Arquivos (Drive) — o formato que as telas recebem do servidor. Só tipos e
// funções puras: os componentes de cliente importam daqui, nunca de
// `servidor.ts`, que fala com o banco.

/** Uma pasta na listagem. */
export type PastaNaTela = {
  id: string;
  nome: string;
  /** Rótulo do setor dono, quando a pasta é só de um setor. */
  setor: string | null;
  setorCode: string | null;
  /** Do modelo ou "Enviados pelo cliente": não renomeia, não move, não exclui. */
  daCasa: boolean;
  enviados: boolean;
  /** A própria pasta está compartilhada com o cliente (não conta herança). */
  compartilhada: boolean;
  /** Arquivos e pastas logo abaixo, fora da lixeira. */
  itens: number;
};

/** Um arquivo na listagem. */
export type ArquivoNaTela = {
  id: string;
  nome: string;
  tamanho: number;
  mime: string;
  /** PDF ou imagem: abre no navegador em vez de baixar. */
  previa: boolean;
  enviadoEm: string;
  enviadoPor: string | null;
  /** Mandado pelo cliente pelo portal. */
  peloCliente: boolean;
  /** Quantas vezes alguém do cliente abriu ou baixou, e quando foi a última. */
  acessosDoCliente: number;
  ultimoAcessoDoCliente: string | null;
  /** Vencimento do documento, "AAAA-MM-DD", quando tem. */
  venceEm: string | null;
};

/** Uma pasta para onde dá para mover algo, com o caminho para a pessoa reconhecer. */
export type DestinoNaTela = { id: string; rotulo: string; caminhoIds: string[] };

export type SetorNaTela = { code: string; label: string };

/**
 * A página de arquivos aberta numa pasta (10/11/2026): o servidor traz só
 * `porPagina` arquivos; `total` é o da pasta inteira. As pastas vêm inteiras,
 * no topo de toda página.
 */
export type Paginacao = { pagina: number; total: number; porPagina: number };

/** Arquivos por página na tela da equipe e no portal do cliente. */
export const ARQUIVOS_POR_PAGINA_DA_EQUIPE = 100;
export const ARQUIVOS_POR_PAGINA_DO_PORTAL = 50;

/** O `?pagina=` da URL como número inteiro de 1 em diante: lixo, zero ou negativo é a primeira. */
export function paginaPedida(pagina: number | string | null | undefined): number {
  const n = Math.floor(Number(pagina));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * A página que dá para mostrar: a pedida, sem passar da última. Página além do
 * fim — o último arquivo da última página foi para a lixeira, ou o link é
 * antigo — cai na última que tem arquivos; pasta sem arquivos é a página 1.
 */
export function paginaValida(pagina: number, total: number, porPagina: number): number {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  return Math.min(paginaPedida(pagina), ultima);
}

/** Quantas páginas a pasta tem (pelo menos uma). */
export function totalDePaginas(p: Paginacao): number {
  return Math.max(1, Math.ceil(p.total / p.porPagina));
}

export type NavegadorNaTela = {
  /** Empresa dona, ou `null` nas pastas internas do escritório. */
  empresa: { id: string; nome: string } | null;
  /** A pasta aberta, ou `null` no primeiro nível. */
  pasta: {
    id: string;
    nome: string;
    setor: string | null;
    setorCode: string | null;
    daCasa: boolean;
    enviados: boolean;
    compartilhada: boolean;
    /** Nome da pasta acima que já compartilha esta com o cliente, quando houver. */
    compartilhadaPor: string | null;
  } | null;
  /** Da raiz até a pasta aberta, inclusive. */
  caminho: { id: string; nome: string }[];
  subpastas: PastaNaTela[];
  /** Só os da página aberta; o total da pasta está em `paginacao`. */
  arquivos: ArquivoNaTela[];
  paginacao: Paginacao;
  /** Pode enviar, criar pasta, renomear, mover e excluir aqui. */
  podeMexer: boolean;
  /** Setores a que quem vê pode restringir uma pasta nova. */
  setores: SetorNaTela[];
  destinos: DestinoNaTela[];
  uso: { arquivos: number; bytes: number };
  /** Hoje em Brasília, "AAAA-MM-DD" — para o selo do vencimento sair igual no servidor e no navegador. */
  hoje: string;
};

/** Resultado de uma busca por nome dentro de uma empresa (ou das pastas internas). */
export type ResultadoDaBusca = ArquivoNaTela & { pastaId: string; pastaRotulo: string };

/** O arquivo é o PDF de uma guia ou o comprovante de uma certidão emitida pelo Connect. */
export type VinculoDoArquivo = "guia" | "certidao";

/** Um arquivo achado na busca em todas as empresas (09/11/2026, src/lib/drive/busca.ts). */
export type ArquivoAchado = {
  id: string;
  nome: string;
  tamanho: number;
  /** PDF ou imagem: abre no navegador em vez de baixar. */
  previa: boolean;
  enviadoEm: string;
  /** A dona da pasta; `null` nas pastas internas do escritório. */
  empresa: { id: string; nome: string; cnpj: string | null } | null;
  pastaId: string;
  /** "Fiscal › 2026": o caminho da pasta, da raiz da empresa até ela. */
  pastaRotulo: string;
  vinculo: VinculoDoArquivo | null;
};

/** O nome da raiz das pastas que não são de nenhuma empresa. */
export const ROTULO_DAS_INTERNAS = "Pastas do escritório";

/** Onde abre a pasta do arquivo achado: nos Arquivos da empresa, ou nas pastas do escritório. */
export function enderecoDoAchado(a: Pick<ArquivoAchado, "empresa" | "pastaId">): string {
  return enderecoDaPasta(a.empresa ? `/arquivos/empresa/${a.empresa.id}` : "/arquivos/internas", a.pastaId);
}

/** O nome do campo "Guardar também em Arquivos" nos formulários dos módulos (lido por src/lib/drive/guardarTambem.ts). */
export const CAMPO_DA_PASTA = "guardarEmPasta";

/** O endereço de uma pasta, na tela da equipe. `base` é a tela onde o navegador está montado. */
export function enderecoDaPasta(base: string, pastaId: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (pastaId) params.set("pasta", pastaId);
  const q = params.toString();
  return q ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
}

/**
 * A trilha das pastas: a raiz ("Pastas do escritório", o nome da empresa) e o
 * caminho até a pasta aberta, que é o item sem link.
 */
export function trilhaDaPasta(
  dados: Pick<NavegadorNaTela, "pasta" | "caminho">,
  base: string,
  rotuloDaRaiz: string
): { label: string; href?: string; truncate?: boolean }[] {
  return [
    { label: rotuloDaRaiz, href: dados.pasta ? enderecoDaPasta(base, null) : undefined, truncate: true },
    ...dados.caminho.map((p, i) => ({
      label: p.nome,
      href: i < dados.caminho.length - 1 ? enderecoDaPasta(base, p.id) : undefined,
      truncate: true,
    })),
  ];
}

/** "3 itens", "1 item", "vazia". */
export function rotuloDeItens(n: number): string {
  if (n === 0) return "vazia";
  return n === 1 ? "1 item" : `${n} itens`;
}
