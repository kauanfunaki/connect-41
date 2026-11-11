// O teste de atalhos do Excel e do Connect (Academia, Fase 2, 11/11/2026 —
// Controle interno funcionalidade-594). A tela pede uma ação ("Copiar",
// "Buscar no Connect"…) e a pessoa aperta o atalho; vale quantos acertos ela
// faz em 60 segundos. Puro, sem banco: o banco de atalhos é esta constante.
//
// Atalhos de Windows (Ctrl, e não Cmd). O Excel do escritório é em português,
// onde alguns atalhos mudam (Salvar é Ctrl+B, Localizar é Ctrl+L); onde o do
// Excel em inglês também é comum, os dois valem.
//
// Ficaram de fora os que o navegador não deixa a página pegar: Ctrl+N, Ctrl+T,
// Ctrl+W, Ctrl+Tab, Ctrl+Page Up/Down, Ctrl+1…9 (trocam de aba ou de janela) e
// os do próprio Windows (Alt+Tab, tecla do Windows). Por isso também não estão
// Negrito (Ctrl+N no Excel em português), Selecionar tudo (Ctrl+T) e Formatar
// células (Ctrl+1). Os outros que o navegador usa (Ctrl+S, Ctrl+P, Ctrl+D,
// Ctrl+L, Ctrl+G, F5…) a tela segura com `preventDefault` durante a rodada.

import type { Nivel } from "./regras";

export type OndeDoAtalho = "Excel" | "Connect" | "Geral";

export type Atalho = {
  id: string;
  /** O que a tela pede. */
  acao: string;
  onde: OndeDoAtalho;
  /** O nível a partir do qual o atalho aparece (o médio inclui os fáceis, o difícil inclui todos). */
  nivel: Nivel;
  /** As combinações que valem, já normalizadas (`combinacaoDoEvento`). A primeira é a que o resultado mostra. */
  teclas: readonly string[];
};

const a = (id: string, acao: string, onde: OndeDoAtalho, nivel: Nivel, ...teclas: string[]): Atalho => ({ id, acao, onde, nivel, teclas });

export const BANCO_DE_ATALHOS: readonly Atalho[] = [
  // Fácil: o do dia a dia, em qualquer programa.
  a("copiar", "Copiar", "Geral", "facil", "Ctrl+C"),
  a("colar", "Colar", "Geral", "facil", "Ctrl+V"),
  a("recortar", "Recortar", "Geral", "facil", "Ctrl+X"),
  a("desfazer", "Desfazer", "Geral", "facil", "Ctrl+Z"),
  a("refazer", "Refazer", "Geral", "facil", "Ctrl+Y"),
  a("imprimir", "Imprimir", "Geral", "facil", "Ctrl+P"),
  a("italico", "Itálico", "Excel", "facil", "Ctrl+I"),
  a("salvar", "Salvar a planilha", "Excel", "facil", "Ctrl+B", "Ctrl+S"),
  a("buscar-connect", "Buscar no Connect", "Connect", "facil", "Ctrl+K"),
  a("fechar-connect", "Fechar a janela ou o painel aberto no Connect", "Connect", "facil", "Esc"),
  // Médio: navegar e editar no Excel.
  a("editar-celula", "Editar a célula", "Excel", "medio", "F2"),
  a("ir-a1", "Ir para a célula A1", "Excel", "medio", "Ctrl+Home"),
  a("ir-ultima", "Ir para a última célula com dados", "Excel", "medio", "Ctrl+End"),
  a("ir-borda-baixo", "Descer até o fim dos dados da coluna", "Excel", "medio", "Ctrl+↓"),
  a("filtro", "Ligar ou desligar o filtro", "Excel", "medio", "Ctrl+Shift+L"),
  a("data-hoje", "Inserir a data de hoje", "Excel", "medio", "Ctrl+;"),
  a("autosoma", "AutoSoma", "Excel", "medio", "Alt+="),
  a("selecionar-coluna", "Selecionar a coluna inteira", "Excel", "medio", "Ctrl+Espaço"),
  a("selecionar-linha", "Selecionar a linha inteira", "Excel", "medio", "Shift+Espaço"),
  a("ir-para", "Ir para uma célula (Ir para)", "Excel", "medio", "Ctrl+G", "F5"),
  a("localizar", "Localizar na planilha", "Excel", "medio", "Ctrl+L", "Ctrl+F"),
  a("excluir-celulas", "Excluir as células selecionadas", "Excel", "medio", "Ctrl+-"),
  // Difícil: formatação e o que quem usa muito o Excel sabe.
  a("fixar-referencia", "Fixar a referência na fórmula ($A$1)", "Excel", "dificil", "F4"),
  a("quebra-linha", "Quebrar a linha dentro da célula", "Excel", "dificil", "Alt+Enter"),
  a("nota", "Inserir ou editar a nota da célula", "Excel", "dificil", "Shift+F2"),
  a("nova-planilha", "Inserir uma planilha nova", "Excel", "dificil", "Shift+F11"),
  a("grafico", "Criar um gráfico com os dados selecionados", "Excel", "dificil", "Alt+F1"),
  a("moeda", "Formatar como moeda", "Excel", "dificil", "Ctrl+Shift+$"),
  a("porcentagem", "Formatar como porcentagem", "Excel", "dificil", "Ctrl+Shift+%"),
  a("preencher-baixo", "Preencher para baixo", "Excel", "dificil", "Ctrl+D"),
  a("selecionar-borda", "Selecionar até o fim dos dados da coluna", "Excel", "dificil", "Ctrl+Shift+↓"),
  a("selecionar-ate-fim", "Selecionar até a última célula com dados", "Excel", "dificil", "Ctrl+Shift+End"),
];

const POR_ID = new Map(BANCO_DE_ATALHOS.map((x) => [x.id, x]));
export const atalhoPorId = (id: string) => POR_ID.get(id) ?? null;

const ORDEM: Record<Nivel, number> = { facil: 0, medio: 1, dificil: 2 };
/** Os atalhos que podem cair no nível: o médio inclui os fáceis, o difícil, todos. */
export const atalhosDoNivel = (nivel: Nivel) => BANCO_DE_ATALHOS.filter((x) => ORDEM[x.nivel] <= ORDEM[nivel]);

/**
 * Quantos pedidos a rodada serve: mais do que alguém responde em 60 s. Os
 * atalhos se repetem, nunca dois iguais seguidos.
 */
export const PEDIDOS_POR_RODADA = 80;

/** A sequência de pedidos da rodada (ids), sem o mesmo atalho duas vezes seguidas. */
export function sortearPedidos(nivel: Nivel, sorteio: () => number = Math.random, quantos = PEDIDOS_POR_RODADA): string[] {
  const pool = atalhosDoNivel(nivel).map((x) => x.id);
  const lista: string[] = [];
  while (lista.length < quantos) {
    const id = pool[Math.floor(sorteio() * pool.length)] ?? pool[0];
    if (pool.length > 1 && id === lista[lista.length - 1]) continue;
    lista.push(id);
  }
  return lista;
}

// ─── A tecla apertada ────────────────────────────────────────────────────────

export type TeclaApertada = { key: string; code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean };

const NOMES: Record<string, string> = {
  Escape: "Esc", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
  ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→", " ": "Espaço", Spacebar: "Espaço",
};
const SO_MODIFICADOR = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS", "CapsLock", "NumLock", "Dead", "Unidentified", "Process"]);

/**
 * A combinação, no formato do banco ("Ctrl+Shift+L", "Alt+=", "F2", "Esc"),
 * ou nulo quando ainda não é uma resposta: só um modificador, ou uma tecla de
 * texto sem Ctrl nem Alt (digitar uma letra não responde).
 *
 * Letras saem pela posição (`code`), em maiúscula: o Ctrl+C é o mesmo em
 * qualquer teclado. O resto sai pelo caractere (`key`): no ABNT2 e no
 * americano, Shift+4 é "$" e o ";" fica sem Shift. Cmd conta como Ctrl.
 */
export function combinacaoDoEvento(e: TeclaApertada): string | null {
  if (SO_MODIFICADOR.has(e.key)) return null;
  const ctrl = e.ctrlKey || e.metaKey;
  let tecla: string;
  if (/^Key[A-Z]$/.test(e.code)) tecla = e.code.slice(3);
  else if (/^F([1-9]|1[0-2])$/.test(e.key)) tecla = e.key;
  else if (NOMES[e.key]) tecla = NOMES[e.key];
  else if (e.key.length === 1) tecla = e.key.toUpperCase();
  else return null;
  // Sem Ctrl nem Alt, só valem as teclas de função, o Esc e o Shift+Espaço: o
  // resto (letras, Tab, Enter, setas) é digitar ou andar pela tela — o Tab
  // continua levando ao botão "Finalizar".
  if (!ctrl && !e.altKey && !(/^F\d+$/.test(tecla) || tecla === "Esc" || (e.shiftKey && tecla === "Espaço"))) return null;
  // Shift com caractere: o "$" já diz que o Shift está apertado. Fica no
  // texto para casar com "Ctrl+Shift+$" do banco.
  return [ctrl && "Ctrl", e.shiftKey && "Shift", e.altKey && "Alt", tecla].filter(Boolean).join("+");
}

/** O navegador deixa a página segurar esta combinação? As de trocar de aba/janela, não. */
export function navegadorPrende(combinacao: string): boolean {
  return /^Ctrl\+(Shift\+)?([NTW]|Tab|PageUp|PageDown|[1-9])$/.test(combinacao);
}

// ─── A correção ──────────────────────────────────────────────────────────────

export type CorrecaoDoPedido = { id: string; acao: string; certa: string; respondida: string | null; acertou: boolean };

export type ResultadoDosAtalhos =
  | { ok: true; acertos: number; total: number; precisao: number; duracaoMs: number; correcao: CorrecaoDoPedido[] }
  | { ok: false; codigo: "respostas" | "curta" | "rapida"; motivo: string };

const TEMPO_DA_RODADA_MS = 60_000;
const TOLERANCIA_DO_RELOGIO_MS = 15_000;
const DURACAO_MINIMA_MS = 3_000;
/** Ninguém lê o pedido e aperta o atalho em menos de 250 ms, em média. */
const MINIMO_POR_RESPOSTA_MS = 250;

/**
 * Corrige o envio: as respostas, na ordem dos pedidos servidos (a resposta i
 * é do pedido i; o que não foi respondido fica de fora). Vale quantos acertos;
 * a precisão é acertos ÷ respondidos. A duração do navegador vale como na
 * lógica, com teto de 60 s.
 */
export function avaliarAtalhos(entrada: {
  pedidos: readonly string[];
  respostas: readonly (string | null)[];
  duracaoDoNavegadorMs: number;
  decorridoNoServidorMs: number;
}): ResultadoDosAtalhos {
  if (entrada.respostas.length > entrada.pedidos.length) return { ok: false, codigo: "respostas", motivo: "Há mais respostas do que pedidos." };
  const navegador = Number.isFinite(entrada.duracaoDoNavegadorMs) ? entrada.duracaoDoNavegadorMs : entrada.decorridoNoServidorMs;
  const confiavel = navegador <= entrada.decorridoNoServidorMs + 1_000 && entrada.decorridoNoServidorMs - navegador <= TOLERANCIA_DO_RELOGIO_MS;
  const duracaoMs = Math.min(Math.round(confiavel ? navegador : entrada.decorridoNoServidorMs), TEMPO_DA_RODADA_MS);
  if (duracaoMs < DURACAO_MINIMA_MS) return { ok: false, codigo: "curta", motivo: "A rodada durou menos de 3 segundos." };
  const respondidas = entrada.respostas.filter((r) => r !== null).length;
  if (respondidas > 0 && duracaoMs / respondidas < MINIMO_POR_RESPOSTA_MS) return { ok: false, codigo: "rapida", motivo: "Respostas rápidas demais para alguém lendo a tela." };

  const correcao: CorrecaoDoPedido[] = [];
  entrada.respostas.forEach((r, i) => {
    const atalho = atalhoPorId(entrada.pedidos[i]);
    if (!atalho) return;
    correcao.push({ id: atalho.id, acao: atalho.acao, certa: atalho.teclas[0], respondida: r, acertou: r !== null && atalho.teclas.includes(r) });
  });
  const acertos = correcao.filter((c) => c.acertou).length;
  const total = correcao.length;
  return { ok: true, acertos, total, precisao: total > 0 ? Math.round((acertos / total) * 10_000) / 100 : 0, duracaoMs, correcao };
}
