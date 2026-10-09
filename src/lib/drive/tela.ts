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
};

/** Uma pasta para onde dá para mover algo, com o caminho para a pessoa reconhecer. */
export type DestinoNaTela = { id: string; rotulo: string; caminhoIds: string[] };

export type SetorNaTela = { code: string; label: string };

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
  arquivos: ArquivoNaTela[];
  /** Pode enviar, criar pasta, renomear, mover e excluir aqui. */
  podeMexer: boolean;
  /** Setores a que quem vê pode restringir uma pasta nova. */
  setores: SetorNaTela[];
  destinos: DestinoNaTela[];
  uso: { arquivos: number; bytes: number };
};

/** Resultado de uma busca por nome dentro de uma empresa (ou das pastas internas). */
export type ResultadoDaBusca = ArquivoNaTela & { pastaId: string; pastaRotulo: string };

/** O endereço de uma pasta, na tela da equipe. `base` é a tela onde o navegador está montado. */
export function enderecoDaPasta(base: string, pastaId: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams(extra);
  if (pastaId) params.set("pasta", pastaId);
  const q = params.toString();
  return q ? `${base}${base.includes("?") ? "&" : "?"}${q}` : base;
}

/** "3 itens", "1 item", "vazia". */
export function rotuloDeItens(n: number): string {
  if (n === 0) return "vazia";
  return n === 1 ? "1 item" : `${n} itens`;
}
