// Sugestão de casamento entre uma linha do extrato e os lançamentos da empresa.
// Funções puras.
//
// ─── O que esta regra NÃO faz ────────────────────────────────────────────────
//
// Não confirma nada. A sugestão só põe um candidato em destaque; quem diz "é
// este" é a pessoa, e a action revalida tudo no servidor. Casamento automático
// errado é o pior defeito possível numa conciliação: o lançamento sai da fila
// como pago, a transação sai como conciliada, e nenhuma das duas volta a chamar
// atenção.
//
// ─── Por que valor exato ─────────────────────────────────────────────────────
//
// Valor é o único dado do extrato que não mente: memo é truncado e varia por
// banco, data de compensação escorrega. Candidato de valor diferente seria juro,
// desconto ou pagamento parcial — e cada um desses pede decisão de alguém, não
// sugestão (o parcial, N→1, está fora desta fatia).

import { diasEntre } from "../periodo";
import { moeda } from "../formato";
import { chaveDaCategoria } from "@/lib/dre/calculo";

export type TipoDoLancamento = "PAGAR" | "RECEBER";
export type StatusDoLancamento = "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";

export type TransacaoParaCasar = {
  /** Com sinal: crédito positivo, débito negativo. */
  centavos: number;
  dataKey: string;
  memo: string | null;
  nome: string | null;
};

export type LancamentoCandidato = {
  id: string;
  kind: TipoDoLancamento;
  status: StatusDoLancamento;
  centavos: number;
  vencimentoKey: string;
  pagoEmKey: string | null;
  contraparteNome: string;
  contraparteDocumento: string | null;
  /** Já tem vínculo com alguma transação. */
  conciliado: boolean;
};

/**
 * Janela da data de vencimento em relação à data do extrato, em dias.
 *
 * Vencimento até 10 dias **antes** do extrato (pagamento atrasado, que é o
 * comum) e até 5 dias **depois** (pagamento adiantado, menos comum). Fora dela
 * o candidato ainda aparece na lista — o valor bate —, mas não pontua por data
 * e nunca vira sugestão forte.
 */
export const JANELA_ATRASO_DIAS = 10;
export const JANELA_ADIANTADO_DIAS = 5;

/** Pontos máximos por data. Baixa no mesmo dia do extrato é o sinal mais forte que existe. */
export const PONTOS_BAIXA_MESMO_DIA = 60;
export const PONTOS_VENCIMENTO_MESMO_DIA = 50;
/** CNPJ/CPF no texto do extrato identifica a contraparte sem ambiguidade. */
export const PONTOS_DOCUMENTO = 40;
export const PONTOS_NOME_COMPLETO = 30;
export const PONTOS_NOME_PARCIAL = 15;

/** Pontuação mínima para uma sugestão forte. */
export const LIMIAR_SUGESTAO_FORTE = 50;
/** Vantagem mínima do primeiro sobre o segundo quando os dois passam do limiar. */
export const VANTAGEM_MINIMA = 20;

/** Que tipo de lançamento uma transação pode liquidar. Débito paga; crédito recebe. */
export function tipoCompativel(centavos: number): TipoDoLancamento | null {
  if (centavos < 0) return "PAGAR";
  if (centavos > 0) return "RECEBER";
  return null;
}

/** Sem acento, maiúsculas, só letras, dígitos e espaço simples. */
export function normalizarTexto(texto: string | null | undefined): string {
  return chaveDaCategoria(texto ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palavras que não identificam ninguém — toda razão social tem uma. */
const PALAVRAS_GENERICAS = new Set([
  "LTDA", "ME", "EPP", "EIRELI", "SA", "DE", "DA", "DO", "DAS", "DOS", "EM",
  "COMERCIO", "SERVICOS", "SERVICO", "INDUSTRIA", "CIA", "COMPANHIA", "BRASIL",
  "PAGAMENTO", "PAG", "PIX", "TED", "DOC", "BOLETO", "TRANSF", "TRANSFERENCIA", "LTDAME",
]);

function palavrasSignificativas(nome: string): string[] {
  return normalizarTexto(nome)
    .split(" ")
    .filter((p) => p.length >= 3 && !PALAVRAS_GENERICAS.has(p) && !/^\d+$/.test(p));
}

export type Motivo = "baixa_mesmo_dia" | "baixa_proxima" | "vencimento" | "documento" | "nome" | "nome_parcial" | "fora_da_janela";

export type CandidatoPontuado = {
  lancamento: LancamentoCandidato;
  pontos: number;
  motivos: Motivo[];
  /** Diferença em dias da data de referência (baixa ou vencimento) até o extrato. */
  distanciaDias: number;
  naJanela: boolean;
};

function pontosDeData(tx: TransacaoParaCasar, l: LancamentoCandidato): { pontos: number; motivo: Motivo; distancia: number; naJanela: boolean } {
  if (l.pagoEmKey) {
    // Já baixado à mão: a data da baixa deveria ser a do extrato. Longe dela, é
    // provável que seja outro pagamento do mesmo valor.
    const d = Math.abs(diasEntre(l.pagoEmKey, tx.dataKey));
    if (d === 0) return { pontos: PONTOS_BAIXA_MESMO_DIA, motivo: "baixa_mesmo_dia", distancia: 0, naJanela: true };
    if (d <= 3) return { pontos: PONTOS_BAIXA_MESMO_DIA - 10 * d, motivo: "baixa_proxima", distancia: d, naJanela: true };
    return { pontos: 0, motivo: "fora_da_janela", distancia: d, naJanela: false };
  }
  // Positivo = o extrato veio depois do vencimento (atraso).
  const atraso = diasEntre(l.vencimentoKey, tx.dataKey);
  const limite = atraso >= 0 ? JANELA_ATRASO_DIAS : JANELA_ADIANTADO_DIAS;
  const d = Math.abs(atraso);
  if (d > limite) return { pontos: 0, motivo: "fora_da_janela", distancia: d, naJanela: false };
  // Decai linearmente até a borda da janela, sem chegar a zero dentro dela.
  const pontos = Math.max(10, Math.round(PONTOS_VENCIMENTO_MESMO_DIA * (1 - d / (limite + 1))));
  return { pontos, motivo: "vencimento", distancia: d, naJanela: true };
}

function pontosDeContraparte(tx: TransacaoParaCasar, l: LancamentoCandidato): { pontos: number; motivo: Motivo | null } {
  const texto = normalizarTexto(`${tx.memo ?? ""} ${tx.nome ?? ""}`);
  if (texto === "") return { pontos: 0, motivo: null };

  const documento = (l.contraparteDocumento ?? "").replace(/\D/g, "");
  if (documento.length === 11 || documento.length === 14) {
    const digitosDoTexto = texto.replace(/\D/g, "");
    // Com a pontuação removida, "12.345.678/0001-90" no memo vira a sequência
    // pura. O CNPJ inteiro basta; a raiz sozinha (8 dígitos) é curta demais
    // para não aparecer por acaso num número de documento.
    if (digitosDoTexto.includes(documento)) return { pontos: PONTOS_DOCUMENTO, motivo: "documento" };
  }

  const nome = normalizarTexto(l.contraparteNome);
  if (nome.length >= 4 && ` ${texto} `.includes(` ${nome} `)) return { pontos: PONTOS_NOME_COMPLETO, motivo: "nome" };

  const palavras = palavrasSignificativas(l.contraparteNome);
  if (palavras.length === 0) return { pontos: 0, motivo: null };
  const presentes = new Set(texto.split(" "));
  const achadas = palavras.filter((p) => presentes.has(p));
  // Metade das palavras que identificam, e ao menos uma com quatro letras —
  // "SAO" sozinho aparece em metade dos memos de São Paulo.
  if (achadas.length * 2 >= palavras.length && achadas.some((p) => p.length >= 4)) {
    return { pontos: PONTOS_NOME_PARCIAL, motivo: "nome_parcial" };
  }
  return { pontos: 0, motivo: null };
}

/** O lançamento pode, em princípio, ser liquidado por esta transação? (Sem olhar o valor.) */
export function lancamentoElegivel(tx: { centavos: number }, l: Pick<LancamentoCandidato, "kind" | "status" | "conciliado">): boolean {
  return l.kind === tipoCompativel(tx.centavos) && l.status !== "CANCELADO" && !l.conciliado;
}

/**
 * Os candidatos para uma transação, do mais provável ao menos.
 *
 * Candidato = elegível e de **valor exato**. A empresa não é conferida aqui: a
 * consulta que monta a lista já filtra por ela, e a action confere de novo.
 */
export function rankearCandidatos(tx: TransacaoParaCasar, lancamentos: LancamentoCandidato[]): CandidatoPontuado[] {
  const alvo = Math.abs(tx.centavos);
  const pontuados: CandidatoPontuado[] = [];
  for (const l of lancamentos) {
    if (!lancamentoElegivel(tx, l) || l.centavos !== alvo) continue;
    const data = pontosDeData(tx, l);
    const contraparte = pontosDeContraparte(tx, l);
    const motivos: Motivo[] = [data.motivo];
    if (contraparte.motivo) motivos.push(contraparte.motivo);
    pontuados.push({
      lancamento: l,
      pontos: data.pontos + contraparte.pontos,
      motivos,
      distanciaDias: data.distancia,
      naJanela: data.naJanela,
    });
  }
  return pontuados.sort(
    (a, b) =>
      b.pontos - a.pontos ||
      a.distanciaDias - b.distanciaDias ||
      a.lancamento.vencimentoKey.localeCompare(b.lancamento.vencimentoKey) ||
      a.lancamento.id.localeCompare(b.lancamento.id)
  );
}

/**
 * O candidato a destacar, ou `null`.
 *
 * Forte só quando não há dúvida razoável: o primeiro está na janela, passa do
 * limiar, e ou é o único acima dele, ou está `VANTAGEM_MINIMA` pontos à frente
 * do segundo. Dois aluguéis iguais vencendo no mesmo dia empatam e não geram
 * sugestão — é exatamente o caso em que a pessoa precisa escolher.
 */
export function sugestaoForte(ranking: CandidatoPontuado[]): CandidatoPontuado | null {
  const [primeiro, segundo] = ranking;
  if (!primeiro || !primeiro.naJanela || primeiro.pontos < LIMIAR_SUGESTAO_FORTE) return null;
  if (!segundo || segundo.pontos < LIMIAR_SUGESTAO_FORTE) {
    // Único acima do limiar — mas um segundo logo abaixo ainda é dúvida.
    if (segundo && primeiro.pontos - segundo.pontos < VANTAGEM_MINIMA) return null;
    return primeiro;
  }
  return primeiro.pontos - segundo.pontos >= VANTAGEM_MINIMA ? primeiro : null;
}

export type SelecaoValidada = { ok: true; totalCentavos: number } | { ok: false; erro: string };

/**
 * A escolha manual de 1..N lançamentos para uma transação fecha?
 *
 * Soma **no centavo**: diferença de um centavo é juro, tarifa ou desconto, e
 * conciliar por cima esconderia essa diferença do DRE.
 */
export function validarSelecao(
  tx: { centavos: number },
  selecionados: (Pick<LancamentoCandidato, "id" | "kind" | "status" | "centavos" | "conciliado" | "contraparteNome"> & {
    /** Motivo que impede a baixa (aprovação por alçada pendente ou reprovada), ou nada. */
    bloqueioDeBaixa?: string | null;
  })[]
): SelecaoValidada {
  const tipo = tipoCompativel(tx.centavos);
  if (!tipo) return { ok: false, erro: "Transação de valor zero não se concilia." };
  if (selecionados.length === 0) return { ok: false, erro: "Escolha ao menos um lançamento." };
  if (new Set(selecionados.map((s) => s.id)).size !== selecionados.length) {
    return { ok: false, erro: "O mesmo lançamento foi escolhido duas vezes." };
  }
  for (const s of selecionados) {
    if (s.kind !== tipo) {
      return {
        ok: false,
        erro: `${s.contraparteNome}: ${tipo === "PAGAR" ? "débito só liquida conta a pagar" : "crédito só liquida conta a receber"}.`,
      };
    }
    if (s.status === "CANCELADO") return { ok: false, erro: `${s.contraparteNome}: lançamento cancelado.` };
    if (s.conciliado) return { ok: false, erro: `${s.contraparteNome}: já está conciliado com outra transação.` };
    if (s.bloqueioDeBaixa) return { ok: false, erro: `${s.contraparteNome}: ${s.bloqueioDeBaixa}` };
    if (s.centavos <= 0) return { ok: false, erro: `${s.contraparteNome}: lançamento sem valor.` };
  }
  const total = selecionados.reduce((acc, s) => acc + s.centavos, 0);
  const alvo = Math.abs(tx.centavos);
  if (total !== alvo) {
    return { ok: false, erro: `A soma dos lançamentos (${moeda(total)}) não fecha com a transação (${moeda(alvo)}).` };
  }
  return { ok: true, totalCentavos: total };
}

