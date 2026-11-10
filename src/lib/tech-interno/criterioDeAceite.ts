// O critério de aceite do item do Controle interno (10/11/2026): o que se
// confere para dar o item por aprovado, num campo próprio, fora da descrição.
//
// O formato é o que a equipe já escrevia no começo da descrição:
//
//   CRITÉRIO DE ACEITE (dd/mm/aaaa)      ← opcional; a data vai para o título da seção
//   Mudança: …
//   Termos: …                            ← às vezes
//   Antes de testar: …
//   Onde testar: …
//   Passos:
//   1. …
//   Aprovado quando:
//   - …                                  ← cada linha vira um ponto de conferência
//   Observação: …                        ← às vezes
//
// Linha que continua a de cima (sem rótulo, sem número, sem marcador) fica no
// mesmo campo ou no mesmo ponto; linha recuada (o comando a rodar) mantém o
// recuo. Rótulo sem acento ou em outra caixa também vale. Texto sem nenhum
// rótulo conhecido aparece como texto simples — nunca quebra a tela.
//
// Aqui também mora a regra da migração dos itens antigos: o bloco que ia do
// "CRITÉRIO DE ACEITE" até antes de "— Contexto anterior —", no começo da
// descrição, passa para o campo novo, e a descrição fica com o que vinha depois
// do separador (`separarCriterioDaDescricao`).
//
// Puro, sem banco: as telas, o servidor, a API e o script usam o mesmo.

export type CampoDoCriterio = "Mudança" | "Termos" | "Antes de testar" | "Onde testar" | "Observação";
type RotuloDoCriterio = CampoDoCriterio | "Passos" | "Aprovado quando";

/** Um ponto do "Aprovado quando". `posicao` conta a partir de 1, na ordem do texto. */
export type PontoDeConferencia = { posicao: number; texto: string };

export type BlocoDoCriterio =
  | { tipo: "campo"; rotulo: CampoDoCriterio; texto: string }
  | { tipo: "passos"; itens: string[] }
  | { tipo: "conferencia"; pontos: PontoDeConferencia[] }
  /** Texto sem rótulo: antes do primeiro rótulo, ou um parágrafo solto depois de uma lista. */
  | { tipo: "texto"; texto: string }
  /** O que veio depois de "— Contexto anterior —", quando alguém colou o bloco inteiro no campo. */
  | { tipo: "contexto"; texto: string };

export type CriterioLido =
  | { estruturado: true; data: string | null; blocos: BlocoDoCriterio[]; pontos: PontoDeConferencia[] }
  | { estruturado: false; data: string | null; texto: string; pontos: PontoDeConferencia[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Para comparar o texto de um ponto: sem diferença de espaço nem de quebra de linha. */
export const mesmoTexto = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

const ROTULOS: Readonly<Record<string, RotuloDoCriterio>> = {
  "mudanca": "Mudança", "termos": "Termos", "antes de testar": "Antes de testar", "onde testar": "Onde testar",
  "passos": "Passos", "aprovado quando": "Aprovado quando", "observacao": "Observação", "observacoes": "Observação", "obs": "Observação",
};
const CABECALHO = /^\s*CRITERIO\s+DE\s+ACEITE\b/i;
const DATA_DO_CABECALHO = /\((\d{1,2}\/\d{1,2}\/\d{2,4})\)/;
// "— Contexto anterior —" e a variante curta "— Contexto —", com travessão,
// meia-risca ou hífen.
const SEPARADOR = /^\s*[-–—]{1,3}\s*contexto(\s+anterior)?\s*[-–—]{1,3}\s*$/i;
const COM_ROTULO = /^\s*([A-Za-z][A-Za-z ]{0,30}?)\.?\s*:\s*(.*)$/;
const NUMERO = /^\s*\d{1,3}\s*[.)]\s+(.*)$/;
const MARCADOR = /^\s*[-•*–—]\s+(.*)$/;

export const ehCabecalhoDoCriterio = (linha: string) => CABECALHO.test(semAcento(linha));
export const ehSeparadorDoContexto = (linha: string) => SEPARADOR.test(semAcento(linha));

function rotuloDaLinha(linha: string): { rotulo: RotuloDoCriterio; resto: string } | null {
  const m = COM_ROTULO.exec(semAcento(linha));
  const rotulo = m && ROTULOS[m[1].trim().toLowerCase()];
  if (!rotulo) return null;
  // O resto vem da linha original (com acento), depois do primeiro ":".
  return { rotulo, resto: linha.slice(linha.indexOf(":") + 1).trim() };
}

/** Junta as linhas de um bloco: sem linhas vazias nas pontas, com o recuo de cada linha preservado. */
function juntar(linhas: string[]): string {
  return linhas.join("\n").replace(/^(?:[ \t]*\n)+/, "").trimEnd();
}

type EmConstrucao =
  | { tipo: "campo"; rotulo: CampoDoCriterio; linhas: string[] }
  | { tipo: "passos" | "conferencia"; itens: string[] }
  | { tipo: "texto"; linhas: string[] };

/**
 * Lê o critério de aceite. `null` quando não há texto. Sem nenhum rótulo
 * conhecido, devolve o texto como está (`estruturado: false`).
 */
export function lerCriterioDeAceite(bruto: string | null | undefined): CriterioLido | null {
  const texto = (bruto ?? "").replace(/\r\n?/g, "\n");
  if (!texto.trim()) return null;
  const linhas = texto.split("\n").map(l => l.trimEnd());
  let i = linhas.findIndex(l => l.trim());
  let data: string | null = null;
  if (ehCabecalhoDoCriterio(linhas[i])) { data = DATA_DO_CABECALHO.exec(linhas[i])?.[1] ?? null; i++; }
  const inicio = i;

  const blocos: EmConstrucao[] = [];
  let atual: EmConstrucao | null = null;
  let achouRotulo = false, depoisDeLinhaVazia = false, contexto: string | null = null;
  const abrir = (b: EmConstrucao) => { blocos.push(b); atual = b; };
  for (; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.trim()) { depoisDeLinhaVazia = true; continue; }
    if (ehSeparadorDoContexto(linha)) { contexto = juntar(linhas.slice(i + 1)); break; }
    const comRotulo = rotuloDaLinha(linha);
    const bloco = atual as EmConstrucao | null;
    if (comRotulo) {
      achouRotulo = true;
      if (comRotulo.rotulo === "Passos" || comRotulo.rotulo === "Aprovado quando") {
        const itens = comRotulo.resto ? [NUMERO.exec(comRotulo.resto)?.[1] ?? MARCADOR.exec(comRotulo.resto)?.[1] ?? comRotulo.resto] : [];
        abrir({ tipo: comRotulo.rotulo === "Passos" ? "passos" : "conferencia", itens });
      } else abrir({ tipo: "campo", rotulo: comRotulo.rotulo, linhas: comRotulo.resto ? [comRotulo.resto] : [] });
    } else if (bloco?.tipo === "passos" || bloco?.tipo === "conferencia") {
      const novo = NUMERO.exec(linha)?.[1] ?? MARCADOR.exec(linha)?.[1];
      // Marcador recuado debaixo de um item é detalhe dele, não um item novo.
      const detalhe = /^\s/.test(linha) && bloco.itens.length > 0;
      if (novo !== undefined && !detalhe) bloco.itens.push(novo.trim());
      else if (!bloco.itens.length) bloco.itens.push(linha.trim());
      else if (!depoisDeLinhaVazia) bloco.itens[bloco.itens.length - 1] += `\n${linha.trim()}`;
      // Um parágrafo depois de uma linha vazia não é mais da lista.
      else abrir({ tipo: "texto", linhas: [linha] });
    } else if (bloco?.tipo === "campo" || bloco?.tipo === "texto") {
      if (depoisDeLinhaVazia) bloco.linhas.push("");
      bloco.linhas.push(linha);
    } else abrir({ tipo: "texto", linhas: [linha] });
    depoisDeLinhaVazia = false;
  }

  if (!achouRotulo) {
    const resto = juntar(linhas.slice(inicio));
    return { estruturado: false, data, texto: resto, pontos: [] };
  }
  let posicao = 0;
  const pontos: PontoDeConferencia[] = [];
  const prontos: BlocoDoCriterio[] = [];
  // Rótulo sem nada escrito ("Termos:" sozinho) não vira seção vazia.
  for (const b of blocos) {
    if (b.tipo === "campo" || b.tipo === "texto") {
      const texto = juntar(b.linhas);
      if (texto) prontos.push(b.tipo === "campo" ? { tipo: "campo", rotulo: b.rotulo, texto } : { tipo: "texto", texto });
    } else if (b.tipo === "passos") { if (b.itens.length) prontos.push({ tipo: "passos", itens: b.itens }); }
    else if (b.itens.length) {
      const doBloco = b.itens.map(texto => ({ posicao: ++posicao, texto }));
      pontos.push(...doBloco);
      prontos.push({ tipo: "conferencia", pontos: doBloco });
    }
  }
  if (contexto) prontos.push({ tipo: "contexto", texto: contexto });
  return { estruturado: true, data, blocos: prontos, pontos };
}

/**
 * As marcas que ainda valem, por posição: a do ponto que continua com o mesmo
 * texto de quando foi marcado. Reescrito o ponto, a marca deixa de valer.
 */
export function marcasQueValem<T extends { position: number; text: string }>(pontos: PontoDeConferencia[], marcas: T[]): Map<number, T> {
  const valem = new Map<number, T>();
  for (const m of marcas) {
    const ponto = pontos.find(p => p.posicao === m.position);
    if (ponto && mesmoTexto(ponto.texto, m.text)) valem.set(m.position, m);
  }
  return valem;
}

// ── A migração dos itens antigos ──────────────────────────────────────────

/**
 * Separa o bloco do critério de aceite do começo da descrição: do
 * "CRITÉRIO DE ACEITE" até antes de "— Contexto anterior —" (ou "— Contexto —").
 * A descrição fica com o que vinha depois do separador; sem separador, fica
 * vazia. `null` quando a descrição não começa pelo bloco — o item não muda.
 */
export function separarCriterioDaDescricao(descricao: string | null | undefined): { criterio: string; descricao: string | null; comSeparador: boolean } | null {
  const linhas = (descricao ?? "").replace(/\r\n?/g, "\n").split("\n").map(l => l.trimEnd());
  const inicio = linhas.findIndex(l => l.trim());
  if (inicio === -1 || !ehCabecalhoDoCriterio(linhas[inicio])) return null;
  const fim = linhas.findIndex((l, k) => k > inicio && ehSeparadorDoContexto(l));
  const criterio = juntar(linhas.slice(inicio, fim === -1 ? undefined : fim));
  const resto = fim === -1 ? "" : juntar(linhas.slice(fim + 1));
  return { criterio, descricao: resto || null, comSeparador: fim !== -1 };
}

export type ItemParaMigrar = { id: string; title: string; version: number; description: string | null; acceptanceCriteria: string | null };
export type Migracao = { id: string; title: string; version: number; criterio: string; descricaoAntes: string | null; descricaoDepois: string | null; comSeparador: boolean };

/**
 * O que o script faz com cada item: passa o bloco para o campo (`mover`) ou
 * deixa como está (`pular`, com o motivo). Item que já tem o campo preenchido
 * não muda — rodar de novo não muda nada.
 */
export function planejarMigracao(itens: ItemParaMigrar[]): { mover: Migracao[]; pular: { id: string; title: string; motivo: string }[] } {
  const mover: Migracao[] = [], pular: { id: string; title: string; motivo: string }[] = [];
  for (const item of itens) {
    const separado = separarCriterioDaDescricao(item.description);
    if (item.acceptanceCriteria?.trim()) {
      if (separado) pular.push({ id: item.id, title: item.title, motivo: "já tem critério no campo próprio; o bloco da descrição fica como está" });
      continue;
    }
    if (!separado) {
      if (semAcento(item.description ?? "").toUpperCase().includes("CRITERIO DE ACEITE")) pular.push({ id: item.id, title: item.title, motivo: "a descrição cita o critério de aceite, mas não começa pelo bloco" });
      continue;
    }
    mover.push({ id: item.id, title: item.title, version: item.version, criterio: separado.criterio, descricaoAntes: item.description, descricaoDepois: separado.descricao, comSeparador: separado.comSeparador });
  }
  return { mover, pular };
}
