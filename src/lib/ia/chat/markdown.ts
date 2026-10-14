// O texto da resposta da Ceci, de Markdown para blocos que a tela desenha
// (13/10/2026). Puro e testado em `markdown.test.ts`; quem desenha é
// `src/components/ia/RespostaDaCeci.tsx`.
//
// ─── Por que um leitor próprio, e não uma biblioteca ────────────────────────
//
// O Connect não tinha Markdown nenhum. As bibliotecas conhecidas (react-markdown
// e o ecossistema unified/remark por trás) trazem dezenas de pacotes para ler
// Markdown inteiro — e o chat quer o contrário: um pedaço pequeno, com regras
// próprias para link. O que entra é só isto:
//
// - negrito, itálico, `código`, título (sempre pequeno: `#` e `##` descem para
//   o tamanho do `###` — título grande não cabe num balão), listas com `-`,
//   `*`, `•` ou `1.`, um nível de sublista, tabela simples e divisor;
// - link **só para dentro do Connect**: `[rótulo](/caminho)` de uma tela que o
//   Connect tem (`telas.ts`). Endereço de fora, `//outro-site`, `javascript:`
//   e imagem viram texto — nunca algo clicável. É a cerca contra um texto que a
//   Ceci leu (nome de empresa, mensagem de cliente) plantar um link na tela;
// - link sozinho na linha vira **botão**; o "Link: /pendencias" solto que as
//   respostas antigas traziam também;
// - HTML nunca é desenhado: a tela monta elementos do React, que escapam o
//   texto, e as marcações que sobrarem aqui são tiradas;
// - id interno (uuid) no meio do texto some, e código de situação que escapou
//   ("SEM_PRAZO", "ABERTA") vira palavra ("sem prazo", "aberta").

import { CITACAO, type TipoCitado } from "./citacoes";
import { ehCaminhoInterno, ehTelaConhecida, nomeDaTela } from "./telas";
import { codigoEmPalavras } from "@/lib/ia/legivel";

export { codigoEmPalavras };

export type Trecho =
  | { t: "texto"; v: string }
  | { t: "negrito"; filhos: Trecho[] }
  | { t: "italico"; filhos: Trecho[] }
  | { t: "codigo"; v: string }
  | { t: "link"; rotulo: string; href: string }
  | { t: "citacao"; tipo: TipoCitado; id: string; nome: string };

export type ItemDaLista = { filhos: Trecho[]; sub: Trecho[][] };

export type Bloco =
  | { t: "paragrafo"; filhos: Trecho[] }
  | { t: "titulo"; filhos: Trecho[] }
  | { t: "lista"; ordenada: boolean; inicio: number; itens: ItemDaLista[] }
  | { t: "tabela"; cabecalho: Trecho[][]; linhas: Trecho[][][] }
  | { t: "botoes"; links: { rotulo: string; href: string }[] }
  | { t: "codigo"; v: string }
  | { t: "divisor" };

// ─── Link: só para dentro do Connect ────────────────────────────────────────

/** O link pode ser clicável? Caminho interno, de uma tela que o Connect tem. */
export function linkPermitido(href: string): boolean {
  return ehCaminhoInterno(href) && ehTelaConhecida(href);
}

/** O rótulo de um botão sem rótulo próprio: "Abrir Pendências ao cliente". */
export function rotuloPadraoDoLink(href: string): string {
  const nome = nomeDaTela(href);
  return nome ? `Abrir ${nome}` : "Abrir a tela";
}

/** O rótulo que o modelo escreveu, sem marcação e sem caminho cru. */
function rotuloLimpo(rotulo: string, href: string): string {
  const limpo = textoSemMarcacao(rotulo).trim();
  return !limpo || limpo.startsWith("/") ? rotuloPadraoDoLink(href) : limpo;
}

// ─── Id interno e código de situação no texto ───────────────────────────────

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** O uuid inteiro, ou um pedaço dele (com pelo menos três grupos e uma letra) cortado com reticências. */
const ID = `(?:${UUID}|(?=[0-9a-f-]*[a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}(?:-[0-9a-f]{1,12}){0,2}(?:…|\\.{3})?)`;
const PALAVRA_DE_ID = "(?:id|ids|código interno|codigo interno|identificador)";

/**
 * Tira do texto todo id interno — a rede de segurança para quando a Ceci cita
 * um item pelo id em vez do nome. Leva junto o "(id: …)" e o "id …" em volta.
 */
export function ocultarIds(texto: string): string {
  if (!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(texto)) return texto;
  return texto
    .replace(new RegExp(`\\s*[([]\\s*(?:${PALAVRA_DE_ID}\\s*[:#]?\\s*)?#?${ID}\\s*[)\\]]`, "gi"), "")
    .replace(new RegExp(`\\s*[—–-]?\\s*\\b${PALAVRA_DE_ID}\\s*[:#]?\\s*#?${ID}(?![0-9a-z])`, "gi"), "")
    .replace(new RegExp(`(?<![0-9a-z-])#?${ID}(?![0-9a-z])`, "gi"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?)])/g, "$1")
    .replace(/\(\s*\)/g, "");
}

/** As situações de uma palavra só que aparecem cruas — só estas: sigla e nome próprio ficam. */
const CODIGOS_SIMPLES = new Set([
  "ABERTA", "ABERTO", "VENCIDA", "VENCIDO", "VENCIDAS", "PENDENTE", "PENDENTES", "LANCADO", "LANCADA",
  "IGNORADO", "IGNORADA", "RESPONDIDA", "RESOLVIDA", "CANCELADA", "CANCELADO", "CONCLUIDO", "CONCLUIDA",
  "ATIVO", "ATIVA", "INATIVO", "INATIVA", "AFASTADO", "DESLIGADO", "AGUARDANDO", "APROVADO", "APROVADA",
  "REPROVADO", "REPROVADA", "PAGA", "PAGO", "AUTORIZADA", "PLANEJADA", "SOLICITADA", "SOLICITADO",
  "PROGRAMADA", "CONFERIDO", "PROVISORIO", "ENCERRADA", "ENCERRADO", "PAUSADA", "TRIAGEM", "ENTREVISTA",
  "CONTRATADO", "DESISTENTE", "PARCIAL", "COMPLETO", "LANCADOS", "IGNORADOS",
]);

/**
 * Troca código de situação que escapou para o texto por palavra. Com "_" é
 * sempre código (sigla não tem). De uma palavra só, só os da lista — e só
 * quando não está colado a outra palavra em maiúsculas, que é nome de empresa
 * ("TRANSPORTES ATIVO LTDA" fica como está).
 */
export function humanizarCodigos(texto: string): string {
  return texto
    .replace(/(?<![\p{L}\p{N}_.-])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/gu, (c) => codigoEmPalavras(c))
    .replace(/(?<![\p{L}\p{N}_.-])[A-Z]{4,}(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])/gu, (c, i: number, todo: string) => {
      if (!CODIGOS_SIMPLES.has(c)) return c;
      const antes = todo.slice(0, i).match(/([\p{L}]+)[ \t]*$/u)?.[1];
      const depois = todo.slice(i + c.length).match(/^[ \t]*([\p{L}]+)/u)?.[1];
      const maiuscula = (p?: string) => Boolean(p && p.length > 1 && p === p.toUpperCase() && p !== p.toLowerCase());
      return maiuscula(antes) || maiuscula(depois) ? c : codigoEmPalavras(c);
    });
}

/** O que todo pedaço de texto puro passa antes de ir para a tela. */
function textoLimpo(v: string): string {
  return humanizarCodigos(ocultarIds(v));
}

// ─── Trechos: negrito, itálico, código, link, citação ───────────────────────

const PADROES: { nome: string; re: RegExp }[] = [
  { nome: "citacao", re: new RegExp(CITACAO.source, "i") },
  { nome: "imagem", re: /!\[([^\]\n]*)\]\(([^)\n]*)\)/ },
  // O endereço aceita um par de parênteses dentro: "javascript:alert(1)" não deixa ")" sobrando no texto.
  { nome: "link", re: /\[([^\]\n]+)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?(?:\s+"[^"\n]*")?\s*\)/ },
  { nome: "codigo", re: /`([^`\n]+)`/ },
  { nome: "negrito", re: /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*|__(?=\S)([^\n]+?)(?<=\S)__/ },
  { nome: "italico", re: /(?<![*\p{L}\p{N}])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![*\p{L}\p{N}])|(?<![\p{L}\p{N}_])_(?=[^\s_])([^_\n]+?)(?<=[^\s_])_(?![\p{L}\p{N}_])/u },
];

/**
 * Caminho solto no meio da frase ("fica em /pagar"): vira link com o nome da
 * tela — só tela que o Connect tem; o resto fica como texto.
 */
const CAMINHO_SOLTO =
  /(^|[\s(“"'])(\/[a-z][a-z0-9-]*(?:\/[A-Za-z0-9_~%-]+(?:\.[A-Za-z0-9_~%-]+)*)*\/?(?:\?[A-Za-z0-9_~%&=+,-]+(?:\.[A-Za-z0-9_~%&=+,-]+)*)?)(?=$|[\s).,;:!?”"'])/g;

function comCaminhosSoltos(v: string): Trecho[] {
  const r: Trecho[] = [];
  let ultimo = 0;
  for (const m of v.matchAll(CAMINHO_SOLTO)) {
    const caminho = m[2]!;
    const inicio = (m.index ?? 0) + m[1]!.length;
    if (!linkPermitido(caminho)) continue;
    if (inicio > ultimo) r.push({ t: "texto", v: v.slice(ultimo, inicio) });
    r.push({ t: "link", rotulo: nomeDaTela(caminho)!, href: caminho });
    ultimo = inicio + caminho.length;
  }
  if (ultimo < v.length) r.push({ t: "texto", v: v.slice(ultimo) });
  return r;
}

function textoPuro(v: string): Trecho[] {
  return comCaminhosSoltos(v)
    .map((t) => (t.t === "texto" ? { t: "texto" as const, v: textoLimpo(t.v) } : t))
    .filter((t) => t.t !== "texto" || t.v !== "");
}

/** Os trechos de uma linha. `profundidade` segura negrito dentro de itálico dentro de… */
export function lerTrechos(linha: string, profundidade = 0): Trecho[] {
  const r: Trecho[] = [];
  let resto = linha;
  while (resto) {
    let melhor: { nome: string; m: RegExpExecArray } | null = null;
    for (const p of PADROES) {
      const m = p.re.exec(resto);
      if (m && (!melhor || m.index < melhor.m.index)) melhor = { nome: p.nome, m };
    }
    if (!melhor) {
      r.push(...textoPuro(resto));
      break;
    }
    const { nome, m } = melhor;
    if (m.index > 0) r.push(...textoPuro(resto.slice(0, m.index)));
    resto = resto.slice(m.index + m[0].length);

    if (nome === "citacao") {
      r.push({ t: "citacao", tipo: m[2]!.toLowerCase() as TipoCitado, id: m[3]!.toLowerCase(), nome: m[1]! });
    } else if (nome === "imagem") {
      // Imagem nunca é carregada: fica o texto alternativo, se houver.
      if (m[1]?.trim()) r.push(...textoPuro(m[1]));
    } else if (nome === "link") {
      const href = m[2]!;
      if (linkPermitido(href)) r.push({ t: "link", rotulo: rotuloLimpo(m[1]!, href), href });
      // Endereço de fora (ou tela que não existe): o rótulo vira texto, sem o endereço.
      else r.push(...textoPuro(textoSemMarcacao(m[1]!)));
    } else if (nome === "codigo") {
      r.push({ t: "codigo", v: ocultarIds(m[1]!) });
    } else {
      const dentro = m[1] ?? m[2] ?? "";
      const filhos = profundidade < 3 ? lerTrechos(dentro, profundidade + 1) : textoPuro(dentro);
      if (filhos.length) r.push({ t: nome === "negrito" ? "negrito" : "italico", filhos });
    }
  }
  return juntarTextos(r);
}

function juntarTextos(ts: Trecho[]): Trecho[] {
  const r: Trecho[] = [];
  for (const t of ts) {
    const anterior = r.at(-1);
    if (t.t === "texto" && anterior?.t === "texto") anterior.v += t.v;
    else r.push(t);
  }
  return r;
}

/** O texto de um rótulo sem `**`, `_`, `` ` `` nem link — para botão e cópia. */
export function textoSemMarcacao(v: string): string {
  return v
    .replace(new RegExp(CITACAO.source, "gi"), "$1")
    .replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, "$1")
    .replace(/\*\*([^\n]+?)\*\*|__([^\n]+?)__/g, (_m, a?: string, b?: string) => a ?? b ?? "")
    .replace(/(?<![\p{L}\p{N}])[*_]([^*_\n]+)[*_](?![\p{L}\p{N}])/gu, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
}

// ─── Blocos ─────────────────────────────────────────────────────────────────

const ITEM = /^(\s*)([-*•+]|(\d{1,3})[.)])\s+(.*)$/;
const TITULO = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const DIVISOR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LINHA_DE_TABELA = /^\s*\|.*\|\s*$/;
const SEPARADOR_DE_TABELA = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** "Link:", "Tela:", "Abrir:", "Confira:", seta — o que pode vir antes de um link sozinho na linha. */
const PREFIXO_DE_LINK = /^(?:(?:link|links|tela|abrir|acesse|veja|confira|conferir|para conferir)\s*:?\s*)?(?:🔗|→|👉|➡️?)?\s*/i;

/**
 * A linha é só um link (com "Link:" ou seta antes, no máximo)? Então vira
 * botão. Vale o link em Markdown e o caminho solto de tela conhecida.
 */
export function linkSozinho(linha: string): { rotulo: string; href: string } | null {
  const sem = linha.trim().replace(PREFIXO_DE_LINK, "").replace(/[.;]$/, "").trim();
  const md = /^(?:\*\*|__)?\[([^\]\n]+)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?\s*\)(?:\*\*|__)?$/.exec(sem);
  if (md) return linkPermitido(md[2]!) ? { rotulo: rotuloLimpo(md[1]!, md[2]!), href: md[2]! } : null;
  if (/^\/\S+$/.test(sem) && linkPermitido(sem)) return { rotulo: rotuloPadraoDoLink(sem), href: sem };
  return null;
}

function celulas(linha: string): string[] {
  return linha.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** HTML que o modelo escreveu: `<br>` vira quebra de linha, o resto das marcações sai e fica o texto. */
function semHtml(texto: string): string {
  return texto.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g, "");
}

/** O texto da resposta em blocos. Linha vazia separa; cada linha de texto é um parágrafo, como no chat. */
export function lerMarkdown(texto: string): Bloco[] {
  const linhas = semHtml(texto.replace(/\r\n?/g, "\n")).split("\n");
  const blocos: Bloco[] = [];
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i]!;
    if (!linha.trim()) {
      i++;
      continue;
    }

    // Bloco de código: texto puro, em fonte fixa.
    if (/^\s*```/.test(linha)) {
      const corpo: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```/.test(linhas[i]!)) corpo.push(linhas[i++]!);
      i++;
      if (corpo.join("").trim()) blocos.push({ t: "codigo", v: ocultarIds(corpo.join("\n")) });
      continue;
    }

    // Tabela: cabeçalho, separador e linhas com "|".
    if (LINHA_DE_TABELA.test(linha) && i + 1 < linhas.length && SEPARADOR_DE_TABELA.test(linhas[i + 1]!)) {
      const cabecalho = celulas(linha).map((c) => lerTrechos(c));
      const corpo: Trecho[][][] = [];
      i += 2;
      while (i < linhas.length && LINHA_DE_TABELA.test(linhas[i]!)) corpo.push(celulas(linhas[i++]!).map((c) => lerTrechos(c)));
      blocos.push({ t: "tabela", cabecalho, linhas: corpo });
      continue;
    }

    const titulo = TITULO.exec(linha);
    if (titulo) {
      const filhos = lerTrechos(titulo[2]!);
      if (filhos.length) blocos.push({ t: "titulo", filhos });
      i++;
      continue;
    }

    if (DIVISOR.test(linha)) {
      // Divisor no começo ou repetido não desenha nada.
      if (blocos.length && blocos.at(-1)!.t !== "divisor") blocos.push({ t: "divisor" });
      i++;
      continue;
    }

    const item = ITEM.exec(linha);
    if (item) {
      const ordenada = item[3] !== undefined;
      const lista: Extract<Bloco, { t: "lista" }> = { t: "lista", ordenada, inicio: ordenada ? Number(item[3]) : 1, itens: [] };
      const recuoBase = item[1]!.length;
      while (i < linhas.length) {
        const l = linhas[i]!;
        const it = ITEM.exec(l);
        if (!it) {
          // Continuação do item (linha recuada, sem marcador) entra no mesmo item.
          if (l.trim() && /^\s{2,}/.test(l) && lista.itens.length) {
            lista.itens.at(-1)!.filhos.push({ t: "texto", v: " " }, ...lerTrechos(l.trim()));
            i++;
            continue;
          }
          break;
        }
        const recuo = it[1]!.length;
        if (recuo >= recuoBase + 2 && lista.itens.length) {
          lista.itens.at(-1)!.sub.push(lerTrechos(it[4]!));
        } else {
          if ((it[3] !== undefined) !== ordenada) break;
          lista.itens.push({ filhos: lerTrechos(it[4]!), sub: [] });
        }
        i++;
      }
      blocos.push(lista);
      continue;
    }

    const so = linkSozinho(linha);
    if (so) {
      const anterior = blocos.at(-1);
      if (anterior?.t === "botoes") anterior.links.push(so);
      else blocos.push({ t: "botoes", links: [so] });
      i++;
      continue;
    }

    const filhos = lerTrechos(linha.replace(/^\s*>\s?/, ""));
    if (filhos.length) blocos.push({ t: "paragrafo", filhos });
    i++;
  }
  return blocos;
}

// ─── Para copiar ────────────────────────────────────────────────────────────

function trechosEmTexto(ts: Trecho[]): string {
  return ts
    .map((t) => {
      if (t.t === "texto" || t.t === "codigo") return t.v;
      if (t.t === "link") return t.rotulo;
      if (t.t === "citacao") return t.nome;
      return trechosEmTexto(t.filhos);
    })
    .join("");
}

/**
 * A resposta como texto simples, para o "Copiar": sem `**`, sem id e sem
 * caminho — quem cola no WhatsApp ou no e-mail recebe o que leu na tela.
 */
export function respostaEmTextoSimples(texto: string): string {
  return lerMarkdown(texto)
    .map((b) => {
      if (b.t === "paragrafo" || b.t === "titulo") return trechosEmTexto(b.filhos);
      if (b.t === "lista") {
        return b.itens
          .map((it, n) =>
            [`${b.ordenada ? `${b.inicio + n}.` : "•"} ${trechosEmTexto(it.filhos)}`, ...it.sub.map((s) => `   • ${trechosEmTexto(s)}`)].join("\n")
          )
          .join("\n");
      }
      if (b.t === "tabela") return [b.cabecalho, ...b.linhas].map((l) => l.map(trechosEmTexto).join(" | ")).join("\n");
      if (b.t === "botoes") return "";
      if (b.t === "codigo") return b.v;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
