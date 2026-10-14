// O que as ferramentas da Lígia devolvem, em palavras de gente (13/10/2026).
//
// Pedido do Kauan: a resposta mostrava "Status: Aberta — Prazo: SEM_PRAZO" e
// "Link: /pendencias?recorte=aguardando". O modelo repete o que a ferramenta
// devolve; então a ferramenta devolve a situação já em português ("sem prazo",
// "aguardando o cliente") e o link já com rótulo, em Markdown
// ("[Abrir as pendências aguardando o cliente](/pendencias?recorte=aguardando)"),
// que o chat desenha como botão. Cada item que tem ficha leva o link dela, para
// a Lígia apontar o item pelo nome — e não pelo id.
//
// A tela ainda tem a rede de segurança (`src/lib/ia/chat/markdown.ts`) para o
// código que escapar; aqui é a fonte.

/** As palavras de código que perdem o acento no banco. */
const ACENTOS: Readonly<Record<string, string>> = {
  ANALISE: "análise",
  CALCULO: "cálculo",
  CONCLUIDO: "concluído",
  CONCLUIDA: "concluída",
  LANCADO: "lançado",
  LANCADA: "lançada",
  LANCADOS: "lançados",
  LANCAMENTO: "lançamento",
  INFORMACAO: "informação",
  CONFIRMACAO: "confirmação",
  APROVACAO: "aprovação",
  EXIGENCIA: "exigência",
  ORGAO: "órgão",
  ADMISSAO: "admissão",
  RESCISAO: "rescisão",
  NAO: "não",
  PROVISORIO: "provisório",
  DOCUMENTACAO: "documentação",
  SOLICITACAO: "solicitação",
  FERIAS: "férias",
  TERMINO: "término",
  PREVISAO: "previsão",
  MEDIA: "média",
};

/** Os de mais de uma palavra que não saem bem só trocando "_" por espaço. */
const COMPOSTOS: Readonly<Record<string, string>> = {
  PENDENTE_APROVACAO: "pendente de aprovação",
  ENVIADO_FOLHA: "enviado para a folha",
  NAO_REQUER: "não requer aprovação",
  TERMINO_CONTRATO: "término de contrato",
  ACORDO_484A: "acordo entre as partes",
};

/** "SEM_PRAZO" → "sem prazo"; "EM_ANALISE" → "em análise"; "sem_previsao" → "sem previsão". */
export function codigoEmPalavras(codigo: string): string {
  const c = codigo.trim().toUpperCase();
  return COMPOSTOS[c] ?? c.split("_").filter(Boolean).map((p) => ACENTOS[p] ?? p.toLowerCase()).join(" ");
}

/** "Aguardando cliente" → "aguardando cliente"; sigla fica ("NF-e", "DRE"). */
export function comMinuscula(rotulo: string): string {
  const [a, b] = [rotulo[0], rotulo[1]];
  if (!a || !b || b !== b.toLowerCase()) return rotulo;
  return a.toLowerCase() + rotulo.slice(1);
}

/**
 * A situação em palavras: o rótulo da tela, se houver um, em minúscula; senão
 * o código traduzido. `null` continua `null` (o modelo diz "sem data", "sem prazo").
 */
export function situacaoLegivel(codigo: string | null | undefined, rotulos?: Readonly<Record<string, string>>): string | null {
  if (codigo === null || codigo === undefined || codigo === "") return null;
  const rotulo = rotulos?.[codigo];
  return rotulo ? comMinuscula(rotulo) : codigoEmPalavras(codigo);
}

/** Um objeto `{ CODIGO: n }` com as chaves em palavras: `{ ATIVO: 3, EM_FERIAS: 1 }` → `{ ativo: 3, "em férias": 1 }`. */
export function chavesLegiveis<T>(obj: Record<string, T>, rotulos?: Readonly<Record<string, string>>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [situacaoLegivel(k, rotulos) ?? k, v]));
}

/**
 * Um link de tela em Markdown, pronto para a Lígia copiar: `[rótulo](/caminho)`.
 * Colchete no rótulo quebraria o link ("[demo] Confirmar…") — vira parêntese;
 * quebra de linha vira espaço.
 */
export function linkDaTela(rotulo: string, caminho: string): string {
  const limpo = rotulo
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `[${limpo || "Abrir"}](${caminho})`;
}

/** "2026-09" → "09/2026", para o rótulo do link. */
export function mesLegivel(competencia: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(competencia);
  return m ? `${m[2]!.padStart(2, "0")}/${m[1]}` : competencia;
}
