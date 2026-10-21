// Regras de conciliação (fila do BPO, 21/10) — como as do Nibo: o que se
// repete no extrato (tarifa, rendimento, aluguel, folha, um fornecedor fixo)
// vira lançamento sem ninguém digitar. Funções puras; a gravação mora em
// `regrasServidor.ts`.
//
// A condição olha só a linha do extrato: o sentido (entrada ou saída), o que o
// histórico ou o favorecido contém, o valor (exato ou numa faixa) e a conta.
// A ação é criar o lançamento — contraparte, categoria, centro, projeto — e já
// conciliar com a linha, como o "Criar lançamento" da tela faz à mão.
//
// ─── Quando a regra lança sozinha ───────────────────────────────────────────
//
// Lançar sozinho é o mesmo risco do casamento automático (ver `casamento.ts`):
// o que sai errado sai da fila e não volta a chamar atenção. Por isso a regra
// em modo "lançar" ainda só sugere quando há dúvida — mais de uma regra pega a
// linha, ou já existe lançamento de mesmo valor que ela poderia liquidar (o
// aluguel que alguém lançou em Contas a pagar: criar outro duplicaria) — e na
// empresa ainda lida do Omie, onde o Omie é a fonte até a virada (lote E).

import { normalizarTexto } from "./casamento";
import { centavosDeTexto } from "../manual";
import { moeda } from "../formato";

export type SentidoDaRegra = "ENTRADA" | "SAIDA";
export type ModoDaRegra = "SUGERIR" | "LANCAR";

export type CondicaoDaRegra = {
  sentido: SentidoDaRegra;
  /** Como a pessoa digitou; a comparação normaliza os dois lados. */
  texto: string | null;
  /** Faixa do valor sem sinal, em centavos. Iguais é o valor exato. */
  minCentavos: number | null;
  maxCentavos: number | null;
  /** Nula vale para qualquer conta da empresa. */
  bankAccountId: string | null;
};

export type RegraParaCasar = CondicaoDaRegra & {
  id: string;
  nome: string;
  modo: ModoDaRegra;
  ativa: boolean;
};

export type LinhaParaRegra = {
  /** Com sinal: crédito positivo, débito negativo. */
  centavos: number;
  memo: string | null;
  nome: string | null;
  bankAccountId: string;
};

/** O sentido da linha do extrato, ou nulo na linha zerada. */
export function sentidoDaLinha(centavos: number): SentidoDaRegra | null {
  if (centavos < 0) return "SAIDA";
  if (centavos > 0) return "ENTRADA";
  return null;
}

/** O tipo do lançamento que a regra cria: saída paga, entrada recebe. */
export function tipoDaRegra(sentido: SentidoDaRegra): "PAGAR" | "RECEBER" {
  return sentido === "SAIDA" ? "PAGAR" : "RECEBER";
}

/**
 * A regra pega esta linha? Pausada não pega nada. O texto é "contém", sem
 * acento, pontuação nem caixa — "Tarifa Bancária" pega "TARIFA BANCARIA PACOTE".
 */
export function regraCasa(regra: CondicaoDaRegra & { ativa?: boolean }, linha: LinhaParaRegra): boolean {
  if (regra.ativa === false) return false;
  if (sentidoDaLinha(linha.centavos) !== regra.sentido) return false;
  if (regra.bankAccountId && regra.bankAccountId !== linha.bankAccountId) return false;
  const valor = Math.abs(linha.centavos);
  if (regra.minCentavos !== null && valor < regra.minCentavos) return false;
  if (regra.maxCentavos !== null && valor > regra.maxCentavos) return false;
  const alvo = normalizarTexto(regra.texto);
  if (alvo !== "") {
    const texto = normalizarTexto(`${linha.memo ?? ""} ${linha.nome ?? ""}`);
    if (!texto.includes(alvo)) return false;
  }
  return true;
}

/** As regras que pegam a linha, pela ordem do nome — a mesma da tela das regras. */
export function regrasQueCasam<R extends RegraParaCasar>(regras: R[], linha: LinhaParaRegra): R[] {
  return regras
    .filter((r) => regraCasa(r, linha))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
}

/** Por que a regra em modo "lançar" ficou só na sugestão desta linha. */
export type PorQueSoSugere = "omie" | "varias_regras" | "lancamento_de_mesmo_valor" | "desfeita";

export const EXPLICACAO_DO_SO_SUGERE: Record<PorQueSoSugere, string> = {
  omie: "A empresa ainda é lida do Omie: até a virada, a regra só sugere — lance no Omie, ou confirme aqui se não vai lançar lá.",
  varias_regras: "Mais de uma regra pega esta linha — confira qual vale.",
  lancamento_de_mesmo_valor: "Já existe lançamento de mesmo valor que esta linha pode liquidar — confira para não duplicar.",
  desfeita: "Esta regra já lançou nesta linha e alguém desfez — confira antes de lançar de novo.",
};

export type DecisaoDaLinha<R extends RegraParaCasar = RegraParaCasar> =
  | { tipo: "nenhuma" }
  /** A pessoa confirma. `outras` são as outras regras que também pegam a linha. */
  | { tipo: "sugerir"; regra: R; outras: number; porQue: PorQueSoSugere | null }
  | { tipo: "lancar"; regra: R };

/**
 * O que fazer com uma linha pendente: nada, sugerir a regra, ou lançar sozinho.
 *
 * Lança sozinho só quando não há dúvida nenhuma: uma regra só pega a linha, ela
 * está em modo "lançar", a empresa já virou do Omie (ou nunca leu de lá), não
 * há lançamento de mesmo valor esperando por esta linha, e ninguém desfez o que
 * esta regra já lançou nela — quem desfez sabia de algo.
 */
export function decisaoDaLinha<R extends RegraParaCasar>(
  regras: R[],
  linha: LinhaParaRegra,
  contexto: { lidaDoOmie: boolean; candidatosDeMesmoValor: number; desfeitas?: ReadonlySet<string> }
): DecisaoDaLinha<R> {
  const casam = regrasQueCasam(regras, linha);
  const [primeira] = casam;
  if (!primeira) return { tipo: "nenhuma" };
  const outras = casam.length - 1;
  const queLanca = casam.find((r) => r.modo === "LANCAR");
  // A sugestão mostra a que lançaria, se houver uma: é a que a pessoa quis automática.
  const regra = queLanca ?? primeira;
  if (regra.modo !== "LANCAR") return { tipo: "sugerir", regra, outras, porQue: null };
  if (contexto.lidaDoOmie) return { tipo: "sugerir", regra, outras, porQue: "omie" };
  if (outras > 0) return { tipo: "sugerir", regra, outras, porQue: "varias_regras" };
  if (contexto.candidatosDeMesmoValor > 0) return { tipo: "sugerir", regra, outras, porQue: "lancamento_de_mesmo_valor" };
  if (contexto.desfeitas?.has(regra.id)) return { tipo: "sugerir", regra, outras, porQue: "desfeita" };
  return { tipo: "lancar", regra };
}

// ─── O formulário da regra ──────────────────────────────────────────────────

export type TipoDoValor = "qualquer" | "exato" | "faixa";

export type CamposDaRegra = {
  nome: string;
  sentido: string;
  texto: string;
  tipoDoValor: string;
  valor: string;
  valorMinimo: string;
  valorMaximo: string;
  bankAccountId: string;
  counterpartyId: string;
  categoryId: string;
  costCenterId: string;
  projectId: string;
  descricao: string;
  modo: string;
};

export type RegraValidada = {
  nome: string;
  sentido: SentidoDaRegra;
  texto: string | null;
  minCentavos: number | null;
  maxCentavos: number | null;
  bankAccountId: string | null;
  counterpartyId: string;
  categoryId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  descricao: string | null;
  modo: ModoDaRegra;
};

/** Texto mínimo, já normalizado: "PIX" sozinho pegaria metade do extrato. */
export const MINIMO_DO_TEXTO = 4;

/**
 * Confere o formulário da regra. Texto ou valor é obrigatório: a regra só com
 * sentido e conta pegaria toda saída da conta. Categoria é obrigatória na saída,
 * como no lançamento manual — despesa sem classificação não fecha o DRE.
 */
export function validarRegra(c: CamposDaRegra): { ok: true; regra: RegraValidada } | { ok: false; erro: string } {
  const nome = c.nome.trim();
  if (nome === "") return { ok: false, erro: "Dê um nome à regra — é como ela aparece na linha do extrato." };
  if (nome.length > 120) return { ok: false, erro: "Nome com mais de 120 caracteres." };

  if (c.sentido !== "ENTRADA" && c.sentido !== "SAIDA") return { ok: false, erro: "Diga se a regra é para entrada ou saída." };
  const sentido: SentidoDaRegra = c.sentido;

  const textoDigitado = c.texto.trim();
  if (textoDigitado.length > 120) return { ok: false, erro: "Texto com mais de 120 caracteres." };
  const normalizado = normalizarTexto(textoDigitado);
  if (normalizado !== "" && normalizado.length < MINIMO_DO_TEXTO) {
    return { ok: false, erro: `O texto precisa de ao menos ${MINIMO_DO_TEXTO} letras ou números — curto demais pegaria linhas que não são desta regra.` };
  }
  const texto = normalizado === "" ? null : textoDigitado;

  let minCentavos: number | null = null;
  let maxCentavos: number | null = null;
  if (c.tipoDoValor === "exato") {
    const v = centavosDeTexto(c.valor);
    if (v === null || v === 0) return { ok: false, erro: "Valor ilegível. Use, por exemplo, 12,90." };
    minCentavos = maxCentavos = v;
  } else if (c.tipoDoValor === "faixa") {
    const min = c.valorMinimo.trim() === "" ? null : centavosDeTexto(c.valorMinimo);
    const max = c.valorMaximo.trim() === "" ? null : centavosDeTexto(c.valorMaximo);
    if ((c.valorMinimo.trim() !== "" && min === null) || (c.valorMaximo.trim() !== "" && max === null)) {
      return { ok: false, erro: "Faixa de valor ilegível. Use, por exemplo, 1.000,00." };
    }
    if (min === null && max === null) return { ok: false, erro: "Informe ao menos um dos limites da faixa de valor." };
    if (min !== null && max !== null && min > max) return { ok: false, erro: "O valor mínimo passa do máximo." };
    minCentavos = min;
    maxCentavos = max;
  } else if (c.tipoDoValor !== "qualquer") {
    return { ok: false, erro: "Diga como a regra olha o valor." };
  }
  if (texto === null && minCentavos === null && maxCentavos === null) {
    return { ok: false, erro: "A regra precisa de um texto ou de um valor — só o sentido pegaria toda linha da conta." };
  }

  const counterpartyId = c.counterpartyId.trim();
  if (counterpartyId === "") return { ok: false, erro: `Escolha ${sentido === "SAIDA" ? "o fornecedor" : "o cliente"} do lançamento.` };
  const categoryId = c.categoryId.trim() || null;
  if (sentido === "SAIDA" && !categoryId) {
    return { ok: false, erro: "Conta a pagar precisa de categoria — despesa sem classificação não fecha o DRE." };
  }

  const descricao = c.descricao.trim();
  if (descricao.length > 255) return { ok: false, erro: "Descrição com mais de 255 caracteres." };

  if (c.modo !== "SUGERIR" && c.modo !== "LANCAR") return { ok: false, erro: "Diga se a regra sugere ou lança sozinha." };

  return {
    ok: true,
    regra: {
      nome,
      sentido,
      texto,
      minCentavos,
      maxCentavos,
      bankAccountId: c.bankAccountId.trim() || null,
      counterpartyId,
      categoryId,
      costCenterId: c.costCenterId.trim() || null,
      projectId: c.projectId.trim() || null,
      descricao: descricao || null,
      modo: c.modo,
    },
  };
}

/** Como a tela mostra a faixa de valor da regra. */
export function textoDoValor(minCentavos: number | null, maxCentavos: number | null): string | null {
  if (minCentavos !== null && minCentavos === maxCentavos) return moeda(minCentavos);
  if (minCentavos !== null && maxCentavos !== null) return `de ${moeda(minCentavos)} a ${moeda(maxCentavos)}`;
  if (minCentavos !== null) return `a partir de ${moeda(minCentavos)}`;
  if (maxCentavos !== null) return `até ${moeda(maxCentavos)}`;
  return null;
}

/** "Saída · contém “TARIFA” · R$ 12,90 · só na Itaú" — a condição numa linha. */
export function descricaoDaCondicao(regra: CondicaoDaRegra, nomeDaConta?: string | null): string {
  const partes: string[] = [regra.sentido === "SAIDA" ? "Saída" : "Entrada"];
  if (regra.texto && normalizarTexto(regra.texto) !== "") partes.push(`contém “${regra.texto}”`);
  const valor = textoDoValor(regra.minCentavos, regra.maxCentavos);
  if (valor) partes.push(valor);
  partes.push(regra.bankAccountId ? `só na conta ${nomeDaConta ?? "escolhida"}` : "qualquer conta");
  return partes.join(" · ");
}

/** Centavos no texto que o campo de valor aceita de volta ("1234,56"). */
function textoDosCentavos(centavos: number): string {
  return `${Math.trunc(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`;
}

/** O formulário de uma regra já gravada, para editar. */
export function camposDaRegraSalva(
  r: CondicaoDaRegra & {
    nome: string;
    modo: ModoDaRegra;
    counterpartyId: string;
    categoryId: string | null;
    costCenterId: string | null;
    projectId: string | null;
    descricao: string | null;
  }
): CamposDaRegra {
  const exato = r.minCentavos !== null && r.minCentavos === r.maxCentavos;
  const faixa = !exato && (r.minCentavos !== null || r.maxCentavos !== null);
  return {
    nome: r.nome,
    sentido: r.sentido,
    texto: r.texto ?? "",
    tipoDoValor: exato ? "exato" : faixa ? "faixa" : "qualquer",
    valor: exato ? textoDosCentavos(r.minCentavos!) : "",
    valorMinimo: faixa && r.minCentavos !== null ? textoDosCentavos(r.minCentavos) : "",
    valorMaximo: faixa && r.maxCentavos !== null ? textoDosCentavos(r.maxCentavos) : "",
    bankAccountId: r.bankAccountId ?? "",
    counterpartyId: r.counterpartyId,
    categoryId: r.categoryId ?? "",
    costCenterId: r.costCenterId ?? "",
    projectId: r.projectId ?? "",
    descricao: r.descricao ?? "",
    modo: r.modo,
  };
}

/** "Banco Itaú · Tarifas bancárias · centro Adm · projeto Obra 1" — a ação numa linha. */
export function descricaoDaAcao(r: { contraparteNome: string; categoriaNome: string | null; centroNome: string | null; projetoNome: string | null }): string {
  const partes = [r.contraparteNome, r.categoriaNome ?? "sem categoria"];
  if (r.centroNome) partes.push(`centro ${r.centroNome}`);
  if (r.projetoNome) partes.push(`projeto ${r.projetoNome}`);
  return partes.join(" · ");
}

// ─── "Sempre que vier assim…" ───────────────────────────────────────────────

/** Palavras do extrato que mudam a cada linha e não servem de condição. */
const PALAVRAS_QUE_MUDAM = new Set(["DE", "DA", "DO", "EM", "PARA", "REF", "DOC", "NR", "NUM"]);

/**
 * O texto que a regra criada a partir de uma linha propõe: o começo do
 * histórico, sem números — a data, o documento e a parcela mudam todo mês, e
 * "TARIFA PACOTE 09 2026" não pegaria a tarifa de outubro. A pessoa edita.
 */
export function textoSugerido(memo: string | null, nome: string | null): string {
  const base = normalizarTexto(memo) || normalizarTexto(nome);
  const palavras = base.split(" ").filter((p) => p.length >= 2 && !/\d/.test(p));
  // Sem as palavras de ligação nas pontas: "PIX ENVIADO PARA" vira "PIX ENVIADO".
  const escolhidas = palavras.slice(0, 4);
  while (escolhidas.length > 1 && PALAVRAS_QUE_MUDAM.has(escolhidas[escolhidas.length - 1]!)) escolhidas.pop();
  return escolhidas.join(" ");
}

/** O formulário da regra preenchido a partir de uma linha conciliada. */
export function camposDaLinha(
  linha: LinhaParaRegra & { contraparteNome?: string | null },
  lancamento: { counterpartyId: string; categoryId: string | null; costCenterId: string | null; projectId: string | null }
): CamposDaRegra {
  const sentido = sentidoDaLinha(linha.centavos) ?? "SAIDA";
  const valor = Math.abs(linha.centavos);
  const texto = textoSugerido(linha.memo, linha.nome);
  const nome = (texto || linha.contraparteNome || "Regra").slice(0, 120);
  return {
    nome: nome.charAt(0) + nome.slice(1).toLowerCase(),
    sentido,
    texto,
    // Com texto, o valor fica de fora: a tarifa muda de valor com o pacote. Sem
    // texto, só o valor identifica a linha.
    tipoDoValor: texto ? "qualquer" : "exato",
    valor: textoDosCentavos(valor),
    valorMinimo: "",
    valorMaximo: "",
    bankAccountId: linha.bankAccountId,
    counterpartyId: lancamento.counterpartyId,
    categoryId: lancamento.categoryId ?? "",
    costCenterId: lancamento.costCenterId ?? "",
    projectId: lancamento.projectId ?? "",
    descricao: "",
    modo: "SUGERIR",
  };
}
