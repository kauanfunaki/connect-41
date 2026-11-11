// O desenho automático do fluxo (10/11/2026, pedido do Kauan). Puro: recebe a
// lista de etapas (ver `etapas.ts`) e devolve caixas, setas e rótulos em
// coordenadas — quem desenha o SVG só pinta. Determinístico: a mesma lista dá
// sempre o mesmo desenho, e é isso que deixa o setor mexer na lista sem medo.
//
// Como arruma, de cima para baixo (o desenho escolhido, "Lista de etapas que
// vira desenho"):
//
// 1. O caminho principal sai do Início seguindo a seguinte (ou o Sim) e vira
//    a coluna da esquerda.
// 2. O Não de cada decisão abre um ramo na coluna à direita, na mesma linha da
//    decisão; o ramo segue a seguinte das etapas dele até encontrar uma etapa
//    já desenhada (ou um Fim). Decisão dentro de ramo abre ramo uma coluna
//    mais à direita — aí o desenho avisa que foi simplificado.
// 3. Cada caixa ocupa uma célula de uma grade (linha × coluna): duas caixas
//    nunca se sobrepõem. Entre as linhas e entre as colunas ficam vãos
//    livres de caixa, e é por eles que as setas que não são retas andam —
//    sempre em ângulo reto, nunca por cima de uma caixa.
// 4. As formas boas do desenho escolhido têm prioridade: reta para baixo,
//    Não para o lado, a volta que sobe pela coluna do ramo e entra pela
//    direita da etapa (tracejada) e o ramo que desce e volta para a coluna
//    principal. Quando a coluna do ramo não está livre, a seta vai pelos vãos.
// 5. Etapa que o Início não alcança vai no fim da coluna da esquerda, marcada
//    "fora do caminho".

import { numerosDasEtapas, saidasDasEtapas, ehVolta, type Etapa, type Executor, type Saida, type TipoDeEtapa, type TipoDeSaida } from "./etapas";

export type Ponto = readonly [number, number];

export type NoDoDesenho = {
  id: string;
  tipo: TipoDeEtapa;
  /** Etapa e decisão têm número (o da lista); Início e Fim não. */
  numero: number | null;
  titulo: string;
  /** O título já quebrado para caber na caixa (com "…" se passou do limite). */
  linhas: string[];
  executor: Executor | null;
  x: number;
  y: number;
  w: number;
  h: number;
  coluna: number;
  linha: number;
  /** O Início não chega aqui. */
  foraDoCaminho: boolean;
};

export type RotuloDaSeta = { texto: string; x: number; y: number; ancora: "start" | "middle" };

export type SetaDoDesenho = {
  de: string;
  para: string;
  tipo: TipoDeSaida;
  /** O destino fica antes na lista: tracejada. */
  volta: boolean;
  pontos: Ponto[];
  rotulo: RotuloDaSeta | null;
};

export type Desenho = {
  largura: number;
  altura: number;
  nos: NoDoDesenho[];
  setas: SetaDoDesenho[];
  /** Ramo dentro de ramo, ou seta que precisou atravessar colunas pelos vãos. */
  simplificado: boolean;
};

// ─── Medidas ────────────────────────────────────────────────────────────────

export const MEDIDAS = {
  coluna: 240,
  margem: 24,
  /** O vão entre duas linhas: livre de caixa, é por ele que as setas atravessam. */
  vaoDaLinha: 44,
  /** O vão mínimo entre duas colunas (cabe o rótulo "Não"). */
  vaoDaColuna: 64,
  faixa: 12,
  alturaDaLinhaDeTexto: 17,
} as const;

/** Quanto texto cabe por linha em cada forma — estimativa a 13px, ~7px por letra. */
const LETRAS_POR_LINHA: Record<TipoDeEtapa, number> = { etapa: 25, decisao: 16, inicio: 28, fim: 28 };
const LINHAS_NO_MAXIMO: Record<TipoDeEtapa, number> = { etapa: 3, decisao: 4, inicio: 2, fim: 2 };
const ALTURA_DA_DECISAO = [104, 104, 120, 140];

/** Quebra por palavra; palavra maior que a linha é cortada; o que sobra vira "…" na última linha. */
export function quebrarEmLinhas(texto: string, porLinha: number, maximo: number): string[] {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [""];
  const linhas: string[] = [];
  let atual = "";
  for (const bruta of palavras) {
    let palavra = bruta;
    while (palavra.length > porLinha) {
      if (atual) {
        linhas.push(atual);
        atual = "";
      }
      linhas.push(palavra.slice(0, porLinha));
      palavra = palavra.slice(porLinha);
    }
    if (!atual) atual = palavra;
    else if (atual.length + 1 + palavra.length <= porLinha) atual = `${atual} ${palavra}`;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual) linhas.push(atual);
  if (linhas.length <= maximo) return linhas;
  const cortadas = linhas.slice(0, maximo);
  const ultima = cortadas[maximo - 1];
  cortadas[maximo - 1] = `${ultima.length >= porLinha ? ultima.slice(0, porLinha - 1) : ultima}…`;
  return cortadas;
}

function tamanhoDaCaixa(tipo: TipoDeEtapa, linhas: number, comExecutor: boolean): { w: number; h: number } {
  const t = MEDIDAS.alturaDaLinhaDeTexto * linhas;
  switch (tipo) {
    case "decisao":
      return { w: 220, h: ALTURA_DA_DECISAO[Math.min(linhas, 4) - 1] };
    case "etapa":
      return { w: MEDIDAS.coluna, h: comExecutor ? 14 + t + 6 + 20 + 12 : Math.max(52, 14 + t + 14) };
    default:
      return { w: MEDIDAS.coluna, h: comExecutor ? 14 + t + 6 + 20 + 12 : 20 + t + 14 };
  }
}

// ─── Posição na grade ───────────────────────────────────────────────────────

type Celula = { coluna: number; linha: number };

type Arrumacao = {
  celulas: Map<string, Celula>;
  foraDoCaminho: Set<string>;
  simplificado: boolean;
};

/** Onde cada etapa fica na grade. */
function arrumar(lista: readonly Etapa[], saidas: Map<string, Saida[]>): Arrumacao {
  const porId = new Map(lista.map((e) => [e.id, e]));
  const principal = (id: string) => saidas.get(id)?.find((s) => s.tipo !== "nao")?.para;
  const naoDe = (id: string) => saidas.get(id)?.find((s) => s.tipo === "nao")?.para;

  // Quem fica em qual cadeia: o nível 0 é a coluna da esquerda.
  const dono = new Map<string, number>();
  const ramos = new Map<string, string[]>();
  const cadeiasDaEsquerda: { ids: string[]; fora: boolean }[] = [];

  const cadeiaDesde = (inicio: string, nivel: number) => {
    const ids: string[] = [];
    let p: string | undefined = inicio;
    while (p && !dono.has(p)) {
      dono.set(p, nivel);
      ids.push(p);
      p = principal(p);
    }
    return ids;
  };
  const reivindicarRamos = (ids: string[]) => {
    const fila = [...ids];
    for (let k = 0; k < fila.length; k++) {
      const id = fila[k];
      if (porId.get(id)?.tipo !== "decisao") continue;
      const nao = naoDe(id);
      if (!nao || dono.has(nao)) continue;
      const ramo = cadeiaDesde(nao, (dono.get(id) ?? 0) + 1);
      ramos.set(id, ramo);
      fila.push(...ramo);
    }
  };

  const inicio = lista.find((e) => e.tipo === "inicio") ?? lista[0];
  if (inicio) {
    const ids = cadeiaDesde(inicio.id, 0);
    cadeiasDaEsquerda.push({ ids, fora: false });
    reivindicarRamos(ids);
  }
  // O que sobrou o Início não alcança: cada pedaço vira uma cadeia no pé da coluna da esquerda.
  for (const e of lista) {
    if (dono.has(e.id)) continue;
    const ids = cadeiaDesde(e.id, 0);
    cadeiasDaEsquerda.push({ ids, fora: true });
    reivindicarRamos(ids);
  }

  const celulas = new Map<string, Celula>();
  const foraDoCaminho = new Set<string>();
  const cursor: number[] = [];
  const livreEm = (c: number) => cursor[c] ?? 0;
  // A última linha do ramo que volta para uma etapa da coluna da esquerda ainda não posta.
  const ramoQueDesagua = new Map<string, number>();
  let simplificado = false;

  const colocar = (ids: string[], coluna: number, linhaInicial: number, fora: boolean): number => {
    let linha = Math.max(linhaInicial, livreEm(coluna));
    let ultima = linha;
    for (const id of ids) {
      if (coluna === 0) {
        // O ramo que volta para a coluna da esquerda desce até a linha dele;
        // a etapa de destino fica abaixo, para a seta descer e virar.
        const desagua = ramoQueDesagua.get(id);
        if (desagua !== undefined) linha = Math.max(linha, desagua + 1);
      }
      const ramo = ramos.get(id);
      // A decisão espera a coluna do ramo estar livre: o Não sai reto para o lado.
      if (ramo && ramo.length > 0) linha = Math.max(linha, livreEm(coluna + 1));
      linha = Math.max(linha, livreEm(coluna));
      celulas.set(id, { coluna, linha });
      if (fora) foraDoCaminho.add(id);
      cursor[coluna] = linha + 1;
      ultima = linha;
      if (ramo && ramo.length > 0) {
        if (coluna + 1 >= 2) simplificado = true;
        const fim = colocar(ramo, coluna + 1, linha, fora);
        const destino = principal(ramo[ramo.length - 1]);
        if (destino && !celulas.has(destino)) ramoQueDesagua.set(destino, Math.max(ramoQueDesagua.get(destino) ?? -1, fim));
      }
      linha += 1;
    }
    return ultima;
  };

  for (const cadeia of cadeiasDaEsquerda) {
    const comeco = cadeia.fora ? Math.max(0, ...cursor.map((c) => c ?? 0)) : 0;
    colocar(cadeia.ids, 0, comeco, cadeia.fora);
  }
  return { celulas, foraDoCaminho, simplificado };
}

// ─── Rotas ──────────────────────────────────────────────────────────────────

type Plano =
  | { k: "reta" }
  | { k: "lado" }
  /** O Não sai para o lado e desce até o topo do destino, na coluna seguinte. */
  | { k: "ladoDesce" }
  /** O Não sai para o lado e sobe até o pé de um Fim já desenhado na coluna seguinte. */
  | { k: "ladoSobe" }
  | { k: "sobe" }
  | { k: "desce" }
  | {
      k: "vaos";
      saida: "baixo" | "direita";
      entrada: "direita" | "topo";
      /** Faixa no corredor à direita da coluna de saída (só com saída pela direita). */
      faixaDaSaida?: number;
      /** Vão por onde a seta atravessa: [índice do vão, posição dentro do vão]. */
      vao?: [number, number];
      /** Faixa no corredor à direita da coluna do destino. */
      faixaDaChegada?: number;
      /** Vão logo acima do destino (entrada pelo topo). */
      vaoDaChegada?: [number, number];
    };

/** O deslocamento de cada posição dentro de um vão — as setas que dividem um vão não se sobrepõem. */
const DESLOCAMENTO_NO_VAO = [0, -8, 8, -16, 16];

/**
 * Desenha o fluxo. A lista pode estar incompleta (o editor desenha enquanto a
 * pessoa escreve): destino que não existe só não vira seta.
 */
export function desenharFluxo(lista: readonly Etapa[]): Desenho {
  if (lista.length === 0) return { largura: 0, altura: 0, nos: [], setas: [], simplificado: false };
  const saidas = saidasDasEtapas(lista);
  const numeros = numerosDasEtapas(lista);
  const { celulas, foraDoCaminho, simplificado: ramoAninhado } = arrumar(lista, saidas);
  const porId = new Map(lista.map((e) => [e.id, e]));

  // Ocupação da grade, para saber se uma coluna está livre num trecho.
  const ocupada = new Set<string>();
  for (const c of celulas.values()) ocupada.add(`${c.coluna}:${c.linha}`);
  const colunaLivre = (coluna: number, de: number, ate: number) => {
    for (let l = de; l <= ate; l++) if (ocupada.has(`${coluna}:${l}`)) return false;
    return true;
  };
  const totalDeColunas = Math.max(...[...celulas.values()].map((c) => c.coluna)) + 1;
  const totalDeLinhas = Math.max(...[...celulas.values()].map((c) => c.linha)) + 1;

  // 1. O plano de cada seta (só depende da grade), com faixas e posições nos vãos.
  const faixasNoCorredor: number[] = Array.from({ length: totalDeColunas }, () => 0);
  const usoDoVao = new Map<number, number>();
  const faixa = (coluna: number) => faixasNoCorredor[coluna]++;
  const posicaoNoVao = (vao: number): [number, number] => {
    const k = usoDoVao.get(vao) ?? 0;
    usoDoVao.set(vao, k + 1);
    return [vao, k];
  };
  let atravessou = false;

  type Ligacao = { de: string; para: string; tipo: TipoDeSaida; plano: Plano };
  const ligacoes: Ligacao[] = [];
  for (const e of lista) {
    for (const s of saidas.get(e.id) ?? []) {
      const a = celulas.get(e.id);
      const b = celulas.get(s.para);
      if (!a || !b) continue;
      const alvo = porId.get(s.para)!;
      const pelaDireita = s.tipo === "nao";
      let plano: Plano;
      if (!pelaDireita && a.coluna === b.coluna && b.linha > a.linha && colunaLivre(a.coluna, a.linha + 1, b.linha - 1)) plano = { k: "reta" };
      else if (pelaDireita && b.coluna === a.coluna + 1 && b.linha === a.linha) plano = { k: "lado" };
      else if (pelaDireita && b.coluna === a.coluna + 1 && b.linha > a.linha && colunaLivre(b.coluna, a.linha, b.linha - 1)) plano = { k: "ladoDesce" };
      // Só num Fim: o pé de uma etapa é a saída dela.
      else if (pelaDireita && alvo.tipo === "fim" && b.coluna === a.coluna + 1 && b.linha < a.linha && colunaLivre(b.coluna, b.linha + 1, a.linha)) plano = { k: "ladoSobe" };
      else if (!pelaDireita && alvo.tipo !== "decisao" && a.coluna === b.coluna + 1 && b.linha < a.linha && colunaLivre(a.coluna, b.linha, a.linha - 1)) plano = { k: "sobe" };
      else if (!pelaDireita && alvo.tipo !== "decisao" && a.coluna === b.coluna + 1 && b.linha > a.linha && colunaLivre(a.coluna, a.linha + 1, b.linha)) plano = { k: "desce" };
      else {
        const entrada = alvo.tipo === "decisao" ? "topo" : "direita";
        const p: Extract<Plano, { k: "vaos" }> = { k: "vaos", saida: pelaDireita ? "direita" : "baixo", entrada };
        if (pelaDireita) {
          p.faixaDaSaida = faixa(a.coluna);
          if (entrada === "topo") p.vaoDaChegada = posicaoNoVao(b.linha);
          else if (b.coluna !== a.coluna) {
            p.vao = posicaoNoVao(b.linha > a.linha ? b.linha : b.linha + 1);
            p.faixaDaChegada = faixa(b.coluna);
          }
        } else {
          p.vao = posicaoNoVao(a.linha + 1);
          if (entrada === "topo") {
            if (b.linha !== a.linha + 1) {
              p.faixaDaChegada = faixa(b.coluna);
              p.vaoDaChegada = posicaoNoVao(b.linha);
            }
          } else p.faixaDaChegada = faixa(b.coluna);
        }
        if (a.coluna !== b.coluna) atravessou = true;
        plano = p;
      }
      ligacoes.push({ de: e.id, para: s.para, tipo: s.tipo, plano });
    }
  }

  // 2. As medidas: caixas, linhas e colunas.
  const caixas = new Map<string, { linhas: string[]; w: number; h: number }>();
  for (const e of lista) {
    const linhas = quebrarEmLinhas(e.titulo || "Sem nome", LETRAS_POR_LINHA[e.tipo], LINHAS_NO_MAXIMO[e.tipo]);
    const comExecutor = !!e.executor && (e.tipo === "etapa" || e.tipo === "inicio");
    caixas.set(e.id, { linhas, ...tamanhoDaCaixa(e.tipo, linhas.length, comExecutor) });
  }
  const alturaDaLinha: number[] = Array.from({ length: totalDeLinhas }, () => 52);
  for (const [id, c] of celulas) alturaDaLinha[c.linha] = Math.max(alturaDaLinha[c.linha], caixas.get(id)!.h);
  const topoDaLinha: number[] = [];
  let y = MEDIDAS.margem;
  for (let l = 0; l < totalDeLinhas; l++) {
    topoDaLinha[l] = y;
    y += alturaDaLinha[l] + MEDIDAS.vaoDaLinha;
  }
  const larguraDoCorredor = faixasNoCorredor.map((n) => Math.max(MEDIDAS.vaoDaColuna, 16 + n * MEDIDAS.faixa + 16));
  const esquerdaDaColuna: number[] = [];
  let x = MEDIDAS.margem;
  for (let c = 0; c < totalDeColunas; c++) {
    esquerdaDaColuna[c] = x;
    x += MEDIDAS.coluna + larguraDoCorredor[c];
  }

  /** O centro do vão `k` (entre a linha k−1 e a linha k; 0 é acima da primeira). */
  const yDoVao = ([k, pos]: [number, number]) => {
    const centro = k <= 0 ? topoDaLinha[0] - MEDIDAS.vaoDaLinha / 2 : topoDaLinha[k - 1] + alturaDaLinha[k - 1] + MEDIDAS.vaoDaLinha / 2;
    return centro + DESLOCAMENTO_NO_VAO[pos % DESLOCAMENTO_NO_VAO.length];
  };
  const xDaFaixa = (coluna: number, k: number) => esquerdaDaColuna[coluna] + MEDIDAS.coluna + 16 + k * MEDIDAS.faixa;

  const nos: NoDoDesenho[] = lista
    .filter((e) => celulas.has(e.id))
    .map((e) => {
      const c = celulas.get(e.id)!;
      const { linhas, w, h } = caixas.get(e.id)!;
      return {
        id: e.id,
        tipo: e.tipo,
        numero: numeros.get(e.id) ?? null,
        titulo: e.titulo,
        linhas,
        executor: e.executor ?? null,
        x: esquerdaDaColuna[c.coluna] + (MEDIDAS.coluna - w) / 2,
        y: topoDaLinha[c.linha] + (alturaDaLinha[c.linha] - h) / 2,
        w,
        h,
        coluna: c.coluna,
        linha: c.linha,
        foraDoCaminho: foraDoCaminho.has(e.id),
      };
    });
  const no = new Map(nos.map((n) => [n.id, n]));
  const cx = (n: NoDoDesenho) => n.x + n.w / 2;
  const cy = (n: NoDoDesenho) => n.y + n.h / 2;

  // 3. Os pontos de cada seta.
  const setas: SetaDoDesenho[] = ligacoes.map(({ de, para, tipo, plano }) => {
    const a = no.get(de)!;
    const b = no.get(para)!;
    const volta = ehVolta(lista, de, para);
    let pontos: Ponto[];
    switch (plano.k) {
      case "reta":
        pontos = [[cx(a), a.y + a.h], [cx(b), b.y]];
        break;
      case "lado":
        pontos = [[a.x + a.w, cy(a)], [b.x, cy(b)]];
        break;
      case "ladoDesce":
        pontos = [[a.x + a.w, cy(a)], [cx(b), cy(a)], [cx(b), b.y]];
        break;
      case "ladoSobe":
        pontos = [[a.x + a.w, cy(a)], [cx(b), cy(a)], [cx(b), b.y + b.h]];
        break;
      case "sobe":
        pontos = [[cx(a), a.y], [cx(a), cy(b)], [b.x + b.w, cy(b)]];
        break;
      case "desce":
        pontos = [[cx(a), a.y + a.h], [cx(a), cy(b)], [b.x + b.w, cy(b)]];
        break;
      case "vaos": {
        const p: [number, number][] = [];
        let emX: number;
        let emY: number;
        if (plano.saida === "direita") {
          emX = xDaFaixa(a.coluna, plano.faixaDaSaida!);
          emY = cy(a);
          p.push([a.x + a.w, cy(a)], [emX, emY]);
        } else {
          emX = cx(a);
          emY = yDoVao(plano.vao!);
          p.push([cx(a), a.y + a.h], [emX, emY]);
        }
        if (plano.entrada === "topo") {
          if (plano.vaoDaChegada) {
            const yTopo = yDoVao(plano.vaoDaChegada);
            if (plano.faixaDaChegada !== undefined) {
              const xc = xDaFaixa(b.coluna, plano.faixaDaChegada);
              p.push([xc, emY], [xc, yTopo]);
            } else p.push([emX, yTopo]);
            p.push([cx(b), yTopo]);
          } else p.push([cx(b), emY]);
          p.push([cx(b), b.y]);
        } else {
          if (plano.saida === "direita" && plano.vao) {
            const yv = yDoVao(plano.vao);
            const xc = xDaFaixa(b.coluna, plano.faixaDaChegada!);
            p.push([emX, yv], [xc, yv]);
            emX = xc;
          } else if (plano.saida === "baixo") {
            const xc = xDaFaixa(b.coluna, plano.faixaDaChegada!);
            p.push([xc, emY]);
            emX = xc;
          }
          p.push([emX, cy(b)], [b.x + b.w, cy(b)]);
        }
        pontos = semPontosRepetidos(p);
        break;
      }
    }
    return { de, para, tipo, volta, pontos, rotulo: rotuloDaSeta(tipo, volta, pontos) };
  });

  // 4. O tamanho do desenho, com a margem em volta de tudo (caixas, setas e rótulos).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const caber = (px: number, py: number) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };
  for (const n of nos) {
    caber(n.x, n.y);
    caber(n.x + n.w, n.y + n.h);
  }
  for (const s of setas) {
    for (const [px, py] of s.pontos) caber(px, py);
    if (s.rotulo) caber(s.rotulo.x + (s.rotulo.ancora === "start" ? 34 : 18), s.rotulo.y - 12);
  }
  const dx = MEDIDAS.margem - minX;
  const dy = MEDIDAS.margem - minY;
  const mover = (px: number, py: number): Ponto => [px + dx, py + dy];
  return {
    largura: Math.ceil(maxX - minX + 2 * MEDIDAS.margem),
    altura: Math.ceil(maxY - minY + 2 * MEDIDAS.margem),
    nos: nos.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
    setas: setas.map((s) => ({
      ...s,
      pontos: s.pontos.map(([px, py]) => mover(px, py)),
      rotulo: s.rotulo ? { ...s.rotulo, x: s.rotulo.x + dx, y: s.rotulo.y + dy } : null,
    })),
    simplificado: ramoAninhado || atravessou,
  };
}

function semPontosRepetidos(p: [number, number][]): Ponto[] {
  const out: [number, number][] = [];
  for (const q of p) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo[0] === q[0] && ultimo[1] === q[1]) continue;
    // Três pontos na mesma reta: o do meio sobra.
    const penultimo = out[out.length - 2];
    if (ultimo && penultimo && ((penultimo[0] === ultimo[0] && ultimo[0] === q[0]) || (penultimo[1] === ultimo[1] && ultimo[1] === q[1]))) out.pop();
    out.push(q);
  }
  return out;
}

/** Sim logo abaixo da saída, Não logo à direita, e "volta" no meio do último trecho deitado. */
function rotuloDaSeta(tipo: TipoDeSaida, volta: boolean, pontos: Ponto[]): RotuloDaSeta | null {
  const [p0, p1] = pontos;
  if (tipo === "sim") return p1[1] > p0[1] ? { texto: "Sim", x: p0[0] + 8, y: p0[1] + 15, ancora: "start" } : { texto: "Sim", x: p0[0] + 8, y: p0[1] - 6, ancora: "start" };
  if (tipo === "nao") return { texto: "Não", x: p0[0] + 8, y: p0[1] - 6, ancora: "start" };
  if (!volta) return null;
  for (let i = pontos.length - 1; i > 0; i--) {
    const [ax, ay] = pontos[i - 1];
    const [bx, by] = pontos[i];
    if (ay === by && Math.abs(bx - ax) >= 40) return { texto: "volta", x: (ax + bx) / 2, y: ay - 6, ancora: "middle" };
  }
  const [ax, ay] = pontos[0];
  return { texto: "volta", x: ax + 8, y: ay - 6, ancora: "start" };
}
