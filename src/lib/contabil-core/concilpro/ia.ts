import "server-only";

// A leitura do Razão de fornecedores por IA (ConcilPro, Bloco D, Fase D3a, 26/11/2026). Porte de
// `src/domain/concilpro/ai_classifier.py` do Contábil Core, com os mesmos prompts:
// - `parsearBlocoFornecedorIa`: o texto do bloco ao agente de texto (`leitor_de_razao_texto`), quando a
//   leitura pelas colunas não fecha;
// - `parsearBlocoFornecedorIaVisao`: as páginas do bloco ao agente de imagem (`leitor_de_razao_imagem`), em
//   lotes de até 3 páginas por chamada, quando o texto também não deu. A falha de um lote interrompe a
//   leitura do arquivo inteiro (`ErroNoLoteDeImagem`, o `VisionBatchError`);
// - `classificarLancamentosIncertos`: os lançamentos de tipo incerto (DEBITO, CREDITO, OUTRO) de uma vez ao
//   agente de classificação (`classificador_de_razao`), que devolve o tipo e o número da nota.
//
// A chamada passa pela peça comum `ia/leituraPorIa.ts` (a fundação de IA do Connect, com o agente do
// catálogo, o teto do mês e a auditoria), atrás da chave do escritório
// (`TenantContabilCoreConfig.iaDocumentosFinanceiros`, desligada por padrão). Desligada (ou sem provedor),
// nada vai à IA e cada leitura devolve "indisponível" com a frase de onde ligar: o bloco segue como no
// original quando o `_get_client` não tinha chave (descartado), e a frase vai para o diagnóstico.
//
// Divergências (ver a "Fase D3a" em docs/CONTABIL-CORE.md):
// - o original só olhava a `OPENAI_API_KEY`: o `ALLOW_FINANCIAL_DATA_TO_OPENAI` não valia para o ConcilPro;
// - a página vai como PDF de uma página (pdf-lib), não como PNG de 150 dpi do PyMuPDF; os documentos vão
//   antes do texto (a ordem da fundação) e, no lote sem o texto do bloco, vai uma linha fixa (a fundação
//   exige texto);
// - os modelos são os das faixas do catálogo (não `gpt-4o-mini` e `gpt-4o`), sem `temperature=0` e sem
//   `response_format: json_object`, que a fundação não expõe (o prompt pede o JSON);
// - o nome de empresa do exemplo do "Formato 2" no prompt de texto foi trocado por um fictício.

import { lerPorIa, Orcamento, type ContextoDeLeitura, type DependenciasDaIa, type ResultadoDaLeitura } from "../ia/leituraPorIa";
import { jsonPython, str as strPy, verdadeiro, type ValorPy } from "../notas/visual";
import { compara, dec, decimal, fixo, NAO_FINITO } from "../motor/decimal";
import { len, strip } from "../extrato/py";
import { erroPython } from "../conciliacao/razaoTipos";
import { pegar, tipoPy, type LancamentoDoRazao, type RespostaDaIa } from "./leitor";

export const AGENTE_TEXTO = "leitor_de_razao_texto";
export const AGENTE_IMAGEM = "leitor_de_razao_imagem";
export const AGENTE_CLASSIFICACAO = "classificador_de_razao";

/** Os limites de cada chamada do original (`timeout` e `max_tokens`). A classificação não tinha `timeout`: vale o padrão do cliente da OpenAI, 600 s. */
export const LIMITES = {
  textoMs: 90_000,
  imagemMs: 120_000,
  classificacaoMs: 600_000,
  maxTokens: 16_000,
  maxTokensDaClassificacao: 1_024,
  paginasPorLote: 3,
} as const;

/** A IA desligada no escritório, dizendo onde ligar (o original só escrevia "IA desativada" no log). */
export const IA_DESLIGADA =
  "A leitura do Razão por IA está desligada neste escritório: os blocos que a leitura pelas colunas não fechou ficaram de fora. " +
  "Ligue, em Contábil Core › Configurações › Leitura de documentos por IA, o consentimento explícito para enviar dados financeiros ao provedor de IA.";
export const IA_SEM_PROVEDOR =
  "A leitura do Razão por IA está indisponível: os blocos que a leitura pelas colunas não fechou ficaram de fora. " +
  "Nenhuma chave de IA configurada: configure em Integrações › Inteligência artificial.";

/** O prazo fixo de uma chamada (o `timeout` do original), sem orçamento de chamadas por arquivo (o original não tinha). */
class PrazoDaChamada extends Orcamento {
  constructor(private readonly limiteMs: number) {
    super({ segundos: 1e9, maxChamadas: Number.MAX_SAFE_INTEGER });
  }
  override get tempoDaChamadaMs(): number {
    return this.limiteMs;
  }
}

/** A recusa da IA que não é falha: a chave desligada ou o escritório sem provedor. */
function indisponivel(r: Extract<ResultadoDaLeitura, { ok: false }>): { indisponivel: string } | null {
  if (r.motivo === "desligada") return { indisponivel: IA_DESLIGADA };
  if (r.motivo === "sem_provedor") return { indisponivel: IA_SEM_PROVEDOR };
  return null;
}

// ─── Os prompts do original ─────────────────────────────────────────────────

export const PARSE_SYSTEM_PROMPT = `Você é um parser especializado em Razão de Fornecedores (contabilidade brasileira).

Receberá o texto bruto de um bloco de fornecedor extraído de PDF. PDFs diferentes produzem formatos distintos — você deve reconhecer e tratar todos eles.

FORMATOS POSSÍVEIS:

Formato 1 — linha única (histórico junto com data):
  "10/01/2025 4 COMPRAS CONFORME NF. Nº 21100 55 4.524,08 8.654,11C"
  → data=10/01/2025, lote=4, historico="COMPRAS CONFORME NF. Nº 21100", conta_partida=55, valor_credito=4524.08, saldo_apos=8654.11, saldo_tipo=C

Formato 2 — histórico ANTES da linha de data (muito comum em PDFs de tabela):
  "COMPRA CONFORME NF NÚMERO 1263290 DE 13.101,10C"   ← histórico + saldo (sem data — IGNORE o valor aqui)
  "LOJA FICTICIA DE MATERIAIS DE OBRAS"               ← ruído — IGNORE
  "26/04/2024 7459 902 13.101,10"                     ← data + lote + CPC + valor real
  → data=26/04/2024, lote=7459, historico="COMPRA CONFORME NF NÚMERO 1263290 DE", conta_partida=902, valor_credito=13101.10, saldo_apos=13101.10, saldo_tipo=C

Formato 3 — pagamento com histórico intercalado antes do lote:
  "09/05/2024 SISPAG BOLETO BANCO 341 7715 SISPAG BOLETO BANCO 341 552 4.150,00 SISPAG BOLETO BANCO 341 35.166,01C"
  → data=09/05/2024, lote=7715, historico="SISPAG BOLETO BANCO 341", conta_partida=552, valor_debito=4150.00, saldo_apos=35166.01, saldo_tipo=C

Formato 4 — histórico repetido N vezes na mesma linha (artefato de PDF com layout multi-coluna):
  "20/05/2024 VLR REF PGTO FGTS 04/2024 1167 VLR REF PGTO FGTS 04/2024 VLR REF PGTO FGTS 04/2024 VLR REF PGTO FGTS 04/2024 9 1.118,34 VLR REF PGTO FGTS 04/2024 4.095,27C"
  → data=20/05/2024, lote=1167, historico="VLR REF PGTO FGTS 04/2024" (use apenas UMA ocorrência), conta_partida=9, valor_debito=1118.34, saldo_apos=4095.27, saldo_tipo=C
  IDENTIFICAÇÃO: a mesma frase de texto aparece 3 ou mais vezes intercalada com números — é sempre o histórico repetido pelo layout do PDF.

Formato 5 — histórico fragmentado em 2 linhas antes da data (histórico quebrado pela largura da coluna):
  "VALOR REFERENTE FGTS S/FOLHA DE 5.154,41C"   ← 1ª parte do histórico + saldo (SEM data — ignore o valor numérico aqui)
  "PAGAMENTO - 05/2024"                          ← 2ª parte do histórico (sem data, sem valor)
  "31/05/2024 370 1.059,14"                      ← data + lote + valor REAL do lançamento
  → data=31/05/2024, lote=370, historico="VALOR REFERENTE FGTS S/FOLHA DE PAGAMENTO - 05/2024", valor_credito=1059.14, saldo_apos=5154.41, saldo_tipo=C
  IDENTIFICAÇÃO: linha sem data que termina com valor+C/D seguida de outra linha sem data e sem valor — ambas são o histórico. O valor real e a data sempre estão na linha que COMEÇA com DD/MM/YYYY.

Formato 6 — COLUNAS ALINHADAS (o texto preserva o espaçamento original do PDF):
  Quando a primeira linha do bloco é o header da tabela, a POSIÇÃO HORIZONTAL de cada
  número diz a que coluna ele pertence. Conte os caracteres.

     Data         Lote  Histórico                          Cta.C.Part.       Débito         Crédito         Saldo-Exercício
  28/02/2026      11190 VALOR A RECOLHER DE IPI DO PERÍODO         425                      2.758,20        2.758,20C
  28/02/2026      11192 VALOR A RECUPERAR DE IPI DO PERÍODO         29       2.758,20                            0,00

  → 1ª: valor 2.758,20 alinhado sob "Crédito"  → valor_credito=2758.20, valor_debito=0, saldo_apos=2758.20, saldo_tipo=C
  → 2ª: valor 2.758,20 alinhado sob "Débito"   → valor_debito=2758.20, valor_credito=0, saldo_apos=0.00

  ATENÇÃO: nesse formato a coluna PREVALECE sobre as palavras-chave das regras 3 e 4.
  "VALOR A RECUPERAR" alinhado na coluna Débito é DÉBITO, mesmo contendo "VALOR".
  Um lançamento nunca tem valor_debito e valor_credito ambos zerados: se você leu um
  número na linha, ele pertence a Débito ou a Crédito conforme a coluna.

REGRAS:
1. Valores em formato brasileiro (1.234,56) → retorne como float padrão (1234.56)
2. Ignore linhas que são apenas o nome do fornecedor/empresa repetido (ruído do PDF)
3. DÉBITO (valor_debito > 0) = pagamento: SISPAG, BOLETO, TED, PIX, PGTO, VLR REF PGTO, PAGAMENTO, BAIXA, TRANSF, DOC
4. CRÉDITO (valor_credito > 0) = provisão/compra: NF, NOTA FISCAL, CT-E, COMPRA, CONFORME, SERVIÇO, AQUISIÇÃO, VALOR REFERENTE, FGTS A RECOLHER, SALDO DE IMPLANTAÇÃO, FÉRIAS, 13O SALÁRIO
5. "SALDO ANTERIOR" → saldo_anterior + saldo_anterior_tipo
6. "Total da conta: X Y" → X=total_debito, Y=total_credito. LEIA DIRETAMENTE — nunca calcule
7. Saldo com sufixo C=credor, D=devedor
8. Nos Formatos 2 e 5: o valor numérico da linha SEM data é o saldo resultante (saldo_apos), NÃO o valor do lançamento
9. Não invente valores; se incerto, use 0
10. tipo_operacao: COMPRA | PAGAMENTO | DEVOLUCAO | DEBITO | CREDITO
11. DEDUPLICAÇÃO: quando o mesmo texto aparece 3+ vezes na mesma linha, é histórico repetido — use-o uma única vez e limpo
12. HISTÓRICO FRAGMENTADO: quando uma linha sem data parece continuação de texto da linha anterior (sem números independentes), concatene-as com espaço para formar o histórico completo
13. COLUNA MANDA: se o bloco começa com o header da tabela (Formato 6), use a posição horizontal do número para decidir entre valor_debito e valor_credito — as palavras-chave das regras 3 e 4 são apenas desempate quando não há header
14. O total_debito informado em "Total da conta" deve fechar com a soma dos valor_debito dos lançamentos; se não fechar, reveja qual coluna cada número ocupa antes de responder

Retorne APENAS JSON válido, sem comentários:
{
  "saldo_anterior": 0.0,
  "saldo_anterior_tipo": "",
  "total_debito": 0.0,
  "total_credito": 0.0,
  "lancamentos": [
    {
      "data": "DD/MM/YYYY",
      "lote": "string",
      "historico": "texto limpo sem repetições",
      "conta_partida": "número ou null",
      "valor_debito": 0.0,
      "valor_credito": 0.0,
      "saldo_apos": 0.0,
      "saldo_tipo": "C ou D ou vazio",
      "tipo_operacao": "COMPRA"
    }
  ]
}`;

export const VISION_SYSTEM_PROMPT = `Você é um especialista em conciliação contábil de fornecedores, com foco em análise de razão contábil brasileiro.

Sua tarefa é:
1. Extrair os lançamentos do bloco de fornecedor visível na imagem
2. Conciliar compras com pagamentos (por NF direta ou FIFO cronológico)
3. Retornar o resultado estruturado em JSON

FORMATOS DE TABELA POSSÍVEIS:

Formato 1 — linha única (histórico + valores na mesma linha):
  "10/01/2025 4 COMPRAS CONFORME NF. Nº 21100 55 4.524,08 8.654,11C"
  → data=10/01/2025, lote=4, historico="COMPRAS CONFORME NF. Nº 21100", conta_partida=55, valor_credito=4524.08, saldo_apos=8654.11, saldo_tipo=C

Formato 2 — histórico ANTES da linha de data:
  "COMPRA CONFORME NF NÚMERO 1263290 DE 13.101,10C"   ← histórico + saldo (SEM data)
  "26/04/2024 7459 902 13.101,10"                     ← data + lote + CPC + valor real
  → data=26/04/2024, lote=7459, historico="COMPRA CONFORME NF NÚMERO 1263290 DE", conta_partida=902, valor_credito=13101.10

Formato 3 — pagamento com histórico repetido intercalado:
  "09/05/2024 SISPAG BOLETO BANCO 341 7715 SISPAG BOLETO BANCO 341 552 4.150,00 SISPAG BOLETO BANCO 341 35.166,01C"
  → data=09/05/2024, lote=7715, historico="SISPAG BOLETO BANCO 341", conta_partida=552, valor_debito=4150.00

Formato 4 — histórico repetido N vezes na mesma linha (layout multi-coluna do PDF):
  "20/05/2024 VLR REF PGTO FGTS 04/2024 1167 VLR REF PGTO FGTS 04/2024 VLR REF PGTO FGTS 04/2024 9 1.118,34 VLR REF PGTO FGTS 04/2024 4.095,27C"
  → data=20/05/2024, lote=1167, historico="VLR REF PGTO FGTS 04/2024" (uma só vez), conta_partida=9, valor_debito=1118.34, saldo_apos=4095.27

Formato 5 — histórico fragmentado em 2 linhas antes da data (coluna estreita):
  "VALOR REFERENTE FGTS S/FOLHA DE 5.154,41C"   ← início do histórico + saldo (ignore o número)
  "PAGAMENTO - 05/2024"                          ← fim do histórico
  "31/05/2024 370 1.059,14"                      ← data + lote + valor REAL
  → data=31/05/2024, lote=370, historico="VALOR REFERENTE FGTS S/FOLHA DE PAGAMENTO - 05/2024", valor_credito=1059.14, saldo_apos=5154.41

REGRAS DE EXTRAÇÃO:
1. Valores em formato brasileiro (1.234,56) → float padrão (1234.56)
2. Ignore texto repetido do nome do fornecedor/empresa (ruído do PDF)
3. DÉBITO = pagamento: SISPAG, BOLETO, TED, PIX, PGTO, VLR REF PGTO, PAGAMENTO, BAIXA, TRANSF, DOC
4. CRÉDITO = provisão/compra: NF, NOTA FISCAL, CT-E, COMPRA, CONFORME, SERVIÇO, AQUISIÇÃO, VALOR REFERENTE, FGTS A RECOLHER, SALDO DE IMPLANTAÇÃO, FÉRIAS, 13O SALÁRIO
5. "SALDO ANTERIOR" → saldo_anterior
6. "Total da conta: X Y" → leia diretamente, nunca calcule
7. Saldo com sufixo C=credor, D=devedor
8. Se a imagem mostrar múltiplos fornecedores, extraia APENAS o fornecedor indicado no contexto
9. tipo_operacao: COMPRA | PAGAMENTO | DEVOLUCAO | DEBITO | CREDITO
10. DEDUPLICAÇÃO: quando o mesmo texto aparece 3+ vezes na mesma linha, é histórico repetido — use-o uma única vez
11. HISTÓRICO FRAGMENTADO: linhas sem data que precedem a data real fazem parte do histórico — concatene-as

REGRAS DE CONCILIAÇÃO:
REGRA 1 — Casamento direto por NF: se pagamento mencionar NF → criterio="regra_1"
REGRA 2 — FIFO cronológico: aplique pagamento na compra mais antiga em aberto → criterio="regra_2"
  - pagamento < compra → parcialmente_paga
  - pagamento = compra → paga
  - pagamento > compra → quite a atual e aplique restante na próxima

Retorne APENAS JSON válido, sem comentários:
{
  "saldo_anterior": 0.0,
  "saldo_anterior_tipo": "C ou D ou vazio",
  "total_debito": 0.0,
  "total_credito": 0.0,
  "lancamentos": [
    {
      "data": "DD/MM/YYYY",
      "lote": "string",
      "historico": "texto limpo",
      "conta_partida": "número ou null",
      "valor_debito": 0.0,
      "valor_credito": 0.0,
      "saldo_apos": 0.0,
      "saldo_tipo": "C ou D ou vazio",
      "tipo_operacao": "COMPRA"
    }
  ],
  "conciliacao": [
    {
      "nf": "string ou null",
      "data_compra": "DD/MM/YYYY",
      "valor_original": 0.0,
      "valor_pago": 0.0,
      "saldo_em_aberto": 0.0,
      "status": "paga | parcialmente_paga | em_aberto",
      "pagamentos": [{"data": "DD/MM/YYYY", "valor": 0.0, "criterio": "regra_1 | regra_2"}]
    }
  ],
  "resumo": {"total_compras": 0.0, "total_pagamentos": 0.0, "saldo_em_aberto": 0.0},
  "validacao": {"saldo_confere": true, "observacoes": []}
}`;

export const CLASSIFY_SYSTEM_PROMPT = `Você é um assistente contábil especializado em lançamentos do Razão de Fornecedores brasileiro.

Classifique cada lançamento:
- COMPRA: aquisição de mercadoria ou serviço (crédito ao fornecedor)
- PAGAMENTO: quitação via boleto, transferência, SISPAG, TED, DOC, PIX
- DEVOLUCAO: devolução ou estorno
- DEBITO: débito genérico não identificável
- CREDITO: crédito genérico não identificável

Extraia também o número da NF/CT-e se houver (apenas dígitos).

Responda EXCLUSIVAMENTE com JSON:
{"resultados": [{"index": 0, "tipo_operacao": "PAGAMENTO", "numero_nf": null}]}`;

// ─── O texto do bloco ───────────────────────────────────────────────────────

/**
 * `parsear_bloco_fornecedor_ia`: o texto do bloco (com 30 caracteres ou mais) ao agente de texto. Devolve o
 * JSON da resposta quando ele é um objeto com a lista `lancamentos`; qualquer falha (o provedor, o JSON, o
 * formato) é nada, como no original.
 */
export async function parsearBlocoFornecedorIa(blocoTexto: string, quem: ContextoDeLeitura, ia?: DependenciasDaIa): Promise<RespostaDaIa> {
  if (!blocoTexto || len(strip(blocoTexto)) < 30) return null;
  const r = await lerPorIa(
    quem,
    { agentCode: AGENTE_TEXTO, sistema: PARSE_SYSTEM_PROMPT, texto: blocoTexto, maxTokens: LIMITES.maxTokens, orcamento: new PrazoDaChamada(LIMITES.textoMs) },
    ia,
  );
  if (!r.ok) return indisponivel(r);
  let dados: ValorPy;
  try {
    dados = jsonPython(r.texto);
  } catch {
    return null;
  }
  if (!(dados instanceof Map) || !Array.isArray(dados.get("lancamentos"))) return null;
  return { dados };
}

// ─── As páginas do bloco ────────────────────────────────────────────────────

/** O `VisionBatchError`: o lote de imagens não deu uma resposta completa e confiável. Interrompe a leitura do arquivo. */
export class ErroNoLoteDeImagem extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "VisionBatchError";
  }
}

/** Uma página do PDF para a IA de imagem: o número dela (a partir de 1) e o PDF de uma página. */
export type PaginaParaIa = { numero: number; pdf: Uint8Array };

/** A linha que vai no lote sem o texto do bloco (o original mandava só as imagens; a fundação exige texto). */
export const TEXTO_SO_DAS_IMAGENS = "Analise as imagens e extraia os lançamentos:";

/** O texto do lote no original: os primeiros 800 caracteres do bloco, quando ele tem mais de 20; senão, nenhum. */
export function textoDoLote(blocoTexto: string): string | null {
  if (!blocoTexto || len(strip(blocoTexto)) <= 20) return null;
  return (
    "Texto extraído (pode estar corrompido — use as imagens como fonte primária):\n" +
    [...blocoTexto].slice(0, 800).join("") +
    "\n\nAnalise as imagens e extraia os lançamentos:"
  );
}

/** `_visao_batch`: até 3 páginas numa chamada. Devolve o JSON (objeto com a lista `lancamentos`) ou lança. */
async function visaoLote(
  paginas: readonly PaginaParaIa[],
  blocoTexto: string,
  quem: ContextoDeLeitura,
  ia?: DependenciasDaIa,
): Promise<Map<string, ValorPy> | { indisponivel: string }> {
  const r = await lerPorIa(
    quem,
    {
      agentCode: AGENTE_IMAGEM,
      sistema: VISION_SYSTEM_PROMPT,
      texto: textoDoLote(blocoTexto) ?? TEXTO_SO_DAS_IMAGENS,
      anexos: paginas.slice(0, LIMITES.paginasPorLote).map((p) => ({ nome: `pagina-${p.numero}.pdf`, mime: "application/pdf", bytes: p.pdf })),
      maxTokens: LIMITES.maxTokens,
      orcamento: new PrazoDaChamada(LIMITES.imagemMs),
    },
    ia,
  );
  if (!r.ok) {
    const fora = indisponivel(r);
    if (fora) return fora;
    throw new ErroNoLoteDeImagem("Falha ao processar um batch Vision");
  }
  let dados: ValorPy;
  try {
    dados = jsonPython(r.texto);
  } catch {
    throw new ErroNoLoteDeImagem("Falha ao processar um batch Vision");
  }
  if (!(dados instanceof Map)) throw new ErroNoLoteDeImagem("Falha ao processar um batch Vision");
  if (!Array.isArray(dados.get("lancamentos"))) throw new ErroNoLoteDeImagem("Vision retornou um batch incompleto");
  return dados;
}

/** O `Decimal("0.00")` do original como valor do `json.loads`. */
const ZERO_COM_CENTAVOS = (): ValorPy => ({ py: "dec", valor: dec("0.00"), texto: "0.00" });

/**
 * `parsear_bloco_fornecedor_ia_visao`: as páginas ao agente de imagem. Até 3, uma chamada (a resposta vai
 * como veio). Mais, em lotes de 3: o texto do bloco só no primeiro, o saldo anterior do primeiro, os
 * lançamentos de todos e os totais do último que os trouxer. A falha de um lote lança
 * `ErroNoLoteDeImagem("Falha no batch Vision N de M")`.
 */
export async function parsearBlocoFornecedorIaVisao(
  paginas: readonly PaginaParaIa[],
  blocoTexto: string,
  quem: ContextoDeLeitura,
  ia?: DependenciasDaIa,
): Promise<RespostaDaIa> {
  if (!paginas.length) return null;
  const tamanho = LIMITES.paginasPorLote;
  if (paginas.length <= tamanho) {
    const r = await visaoLote(paginas, blocoTexto, quem, ia);
    return r instanceof Map ? { dados: r } : r;
  }
  const lotes = Math.ceil(paginas.length / tamanho);
  const todos: ValorPy[] = [];
  let saldoAnterior = ZERO_COM_CENTAVOS();
  let saldoAnteriorTipo: ValorPy = "";
  let totalDebito = ZERO_COM_CENTAVOS();
  let totalCredito = ZERO_COM_CENTAVOS();
  for (let k = 0; k < lotes; k++) {
    let r: Map<string, ValorPy> | { indisponivel: string };
    try {
      r = await visaoLote(paginas.slice(k * tamanho, (k + 1) * tamanho), k === 0 ? blocoTexto : "", quem, ia);
    } catch (e) {
      if (e instanceof ErroNoLoteDeImagem) throw new ErroNoLoteDeImagem(`Falha no batch Vision ${k + 1} de ${lotes}`);
      throw e;
    }
    if (!(r instanceof Map)) return r;
    if (k === 0) {
      const saldo = r.get("saldo_anterior");
      saldoAnterior = verdadeiro(saldo) ? saldo! : ZERO_COM_CENTAVOS();
      const tipo = r.get("saldo_anterior_tipo");
      saldoAnteriorTipo = verdadeiro(tipo) ? tipo! : "";
    }
    todos.push(...(r.get("lancamentos") as ValorPy[]));
    if (verdadeiro(r.get("total_debito"))) totalDebito = r.get("total_debito")!;
    if (verdadeiro(r.get("total_credito"))) totalCredito = r.get("total_credito")!;
  }
  if (!todos.length) return null;
  return {
    dados: new Map<string, ValorPy>([
      ["saldo_anterior", saldoAnterior],
      ["saldo_anterior_tipo", saldoAnteriorTipo],
      ["total_debito", totalDebito],
      ["total_credito", totalCredito],
      ["lancamentos", todos],
    ]),
  };
}

// ─── Os lançamentos incertos ────────────────────────────────────────────────

const TIPOS = ["COMPRA", "PAGAMENTO", "DEVOLUCAO", "DEBITO", "CREDITO", "OUTRO"];

/** `idx >= len(incertos)` do Python: verdadeiro, falso, ou o `TypeError` da comparação. */
function passaDoFim(idx: ValorPy, tamanho: number): boolean {
  if (typeof idx === "boolean") return Number(idx) >= tamanho;
  if (idx === null || typeof idx === "string" || Array.isArray(idx) || idx instanceof Map) {
    throw erroPython("TypeError", `'>=' not supported between instances of '${tipoPy(idx)}' and 'int'`);
  }
  if (idx.py === "int") return BigInt(idx.texto) >= BigInt(tamanho);
  if (idx.py === "float") return idx.texto === "inf";
  const d = decimal(idx.texto);
  if (d === null || d === NAO_FINITO) throw erroPython("InvalidOperation", "[<class 'decimal.InvalidOperation'>]");
  return compara(d, dec(String(tamanho))) >= 0;
}

/** `incertos[idx]` do Python (o índice negativo conta do fim). */
function naPosicao<T>(lista: readonly T[], idx: ValorPy): T {
  let n: bigint;
  if (typeof idx === "boolean") n = BigInt(Number(idx));
  else if (idx !== null && typeof idx === "object" && !Array.isArray(idx) && !(idx instanceof Map) && idx.py === "int") n = BigInt(idx.texto);
  else throw erroPython("TypeError", `list indices must be integers or slices, not ${tipoPy(idx)}`);
  if (n < BigInt(0)) n += BigInt(lista.length);
  if (n < BigInt(0) || n >= BigInt(lista.length)) throw erroPython("IndexError", "list index out of range");
  return lista[Number(n)];
}

/** `for item in v` do Python: a lista, as letras do texto, as chaves do objeto; o resto levanta. */
function itensPy(v: ValorPy | undefined): ValorPy[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return [...v];
  if (v instanceof Map) return [...v.keys()];
  throw erroPython("TypeError", `'${tipoPy(v)}' object is not iterable`);
}

/** A resposta da classificação aplicada aos incertos, até a primeira coisa fora do formato (que para tudo, como no original). */
function aplicarClassificacao(dados: ValorPy, incertos: readonly LancamentoDoRazao[]): void {
  const resultados = dados instanceof Map && !dados.has("resultados") ? [] : pegar(dados, "resultados");
  for (const item of itensPy(resultados)) {
    const idx = pegar(item, "index");
    if (idx === undefined || idx === null || passaDoFim(idx, incertos.length)) continue;
    const lanc = naPosicao(incertos, idx);
    const objeto = item as Map<string, ValorPy>;
    const tipo = objeto.has("tipo_operacao") ? objeto.get("tipo_operacao")! : "";
    if (typeof tipo !== "string") throw erroPython("AttributeError", `'${tipoPy(tipo)}' object has no attribute 'upper'`);
    const tipoIa = tipo.toUpperCase();
    const nfIa = objeto.get("numero_nf");
    if (TIPOS.includes(tipoIa)) {
      lanc.tipoOperacao = tipoIa;
      lanc.classificadoPorIa = true;
    }
    if (verdadeiro(nfIa) && !lanc.numeroNf) {
      const nf = strip(strPy(nfIa!));
      if (len(nf) >= 4) {
        lanc.numeroNf = nf;
        lanc.classificadoPorIa = true;
      }
    }
  }
}

/** A mensagem com os incertos, um por linha, com o débito e o crédito em 2 casas. */
export function mensagemDosIncertos(incertos: readonly LancamentoDoRazao[]): string {
  const linhas = incertos.map((l, i) => `${i}. Histórico: "${strip(l.historico || "")}" | Débito: ${fixo(l.valorDebito, 2)} | Crédito: ${fixo(l.valorCredito, 2)}`);
  return "Classifique os lançamentos:\n\n" + linhas.join("\n");
}

/**
 * `classificar_lancamentos_incertos`: os lançamentos com `classificacaoIncerta` vão juntos ao agente de
 * classificação, e cada resultado (pelo `index`) muda o tipo (um dos conhecidos) e preenche o número da nota
 * que faltava (4 dígitos ou mais), marcando `classificadoPorIa`. Altera os lançamentos recebidos. Falha
 * silenciosa: o que já foi aplicado fica. Devolve a frase quando a IA não estava disponível.
 */
export async function classificarLancamentosIncertos(lancamentos: readonly LancamentoDoRazao[], quem: ContextoDeLeitura, ia?: DependenciasDaIa): Promise<string | null> {
  const incertos = lancamentos.filter((l) => l.classificacaoIncerta);
  if (!incertos.length) return null;
  const r = await lerPorIa(
    quem,
    {
      agentCode: AGENTE_CLASSIFICACAO,
      sistema: CLASSIFY_SYSTEM_PROMPT,
      texto: mensagemDosIncertos(incertos),
      maxTokens: LIMITES.maxTokensDaClassificacao,
      orcamento: new PrazoDaChamada(LIMITES.classificacaoMs),
    },
    ia,
  );
  if (!r.ok) return indisponivel(r)?.indisponivel ?? null;
  try {
    aplicarClassificacao(jsonPython(r.texto), incertos);
  } catch {
    // Como no original: a falha só iria para o log.
  }
  return null;
}
