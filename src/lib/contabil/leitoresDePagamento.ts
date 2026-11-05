// Os leitores dos pagamentos sem nota fiscal (03/11/2026), portados de
// `pagamento_apoio_texto.py` (SPED Generator). RPA, recibo de motorista,
// contrato de motorista, contrato de locação, recibo de layout livre e fatura
// de locação: cada função recebe o TEXTO de uma página do PDF (como o
// `extract_text()` do pdfplumber o devolve) e devolve o que leu. Puras, sem
// banco e sem disco; quem decide qual leitor roda é `leituraDoPdf.ts`.
//
// NUNCA UM CHUTE. Campo que não apareceu volta vazio (ou `null`, no valor), e a
// página que não é do formato volta lista vazia ou `null` -- quem chama conta e
// reporta. Ler valor por adivinhação e mandar para a apuração é o pior desfecho
// possível aqui; quando o leitor precisa palpitar (o recibo sem rótulo), a
// linha sai 'conferir' com o palpite dito.
//
// O que mudou na vinda:
// - a raiz do CNPJ do cliente era global (`_raiz_cliente()`, antes a constante
//   da BLD); aqui é parâmetro (`raizDoCliente`, 8 dígitos). Os nomes que o
//   motor recusava como fornecedor ("BLD", "BATEL") viraram `nomesDoCliente`,
//   e as observações dizem "o cliente" onde diziam "a BLD";
// - dinheiro em centavos inteiros (`brutoCentavos`, `liquidoCentavos`), `null`
//   quando não lido; `valorBrEmCentavos` faz o papel do `valor_br`;
// - a folga da conta do RPA é de um centavo exato (o motor comparava float com
//   0,02, o que na fronteira dependia do arredondamento binário);
// - o `\b` e o `\w` do Python enxergam letra acentuada; os do JS não. Onde a
//   fronteira importa, ela é escrita à mão com `[\wÀ-ÿ]`.

/** Uma retenção do RPA, identificada pela verba (9105, 9135, 9401...). */
export type Retencao = { verba: string; descricao: string; centavos: number };

export type SituacaoDaLeitura = "ok" | "via" | "conferir" | "invalido";

/** O que um leitor devolve de um pagamento. */
export type PagamentoLido = {
  nome: string;
  /** CPF ou CNPJ da contraparte, só dígitos. */
  documento: string;
  numero: string;
  brutoCentavos: number | null;
  liquidoCentavos: number | null;
  /** "AAAA-MM-DD" ou "". */
  dataPagamento: string;
  dataServico: string;
  centroCusto: string;
  retencoes: Retencao[] | null;
  /** Só a fatura preenche (veículo, imóvel ou máquina). */
  categoria?: string;
  situacao: SituacaoDaLeitura;
  observacao: string;
};

// ---------------------------------------------------------------------------
// Utilitários de texto
// ---------------------------------------------------------------------------

const MESES = new Map<string, number>(
  "janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro"
    .split(" ")
    .map((m, i) => [m, i + 1]),
);

/** NFKD e só ASCII, como o `encode("ascii", "ignore")` do motor. */
export function semAcento(texto: string): string {
  return Array.from((texto || "").normalize("NFKD"))
    .filter((c) => c.charCodeAt(0) < 128)
    .join("");
}

/**
 * '1.234,56' -> 123456; '439,2' -> 43920; '300' -> 30000. `null` quando não é
 * número. Mesma regra do `valor_br`: tira os pontos, vírgula vira decimal.
 */
export function valorBrEmCentavos(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.split(".").join("").split(",").join(".").trim();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(limpo);
  if (!m || (!m[2] && !m[3])) return null;
  const fracao = (m[3] ?? "").padEnd(3, "0");
  let centavos = Number(m[2] || "0") * 100 + Number(fracao.slice(0, 2));
  if (fracao[2] >= "5") centavos += 1;
  return m[1] === "-" ? -centavos : centavos;
}

export function digitos(texto: string): string {
  return (texto || "").replace(/\D/g, "");
}

/** `" ".join(texto.split())`. */
function juntaEspacos(texto: string): string {
  return texto.split(/\s+/).filter(Boolean).join(" ");
}

/** `texto.strip(caracteres)`. */
function apara(texto: string, caracteres: string): string {
  let i = 0;
  let j = texto.length;
  while (i < j && caracteres.includes(texto[i])) i++;
  while (j > i && caracteres.includes(texto[j - 1])) j--;
  return texto.slice(i, j);
}

/** `texto[:n]`, contando caractere e não unidade UTF-16. */
export function corta(texto: string, n: number): string {
  const chars = Array.from(texto);
  return chars.length <= n ? texto : chars.slice(0, n).join("");
}

/** `str.splitlines()`. */
function linhasDe(texto: string): string[] {
  if (!texto) return [];
  const linhas = texto.split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/);
  if (linhas[linhas.length - 1] === "") linhas.pop();
  return linhas;
}

/** Todas as ocorrências (`finditer`), sem depender de regex global. */
function todas(re: RegExp, texto: string): RegExpExecArray[] {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const achados: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = global.exec(texto)) !== null) {
    achados.push(m);
    if (m[0] === "") global.lastIndex++;
  }
  return achados;
}

/** `str.isalpha()` de um caractere. */
const LETRA = /\p{L}/u;

/** 12345 -> "123.45" (o `:.2f` do motor). */
function ponto2(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** 580000 -> "5,800.00" (o `:,.2f` do motor, que as observações já usam). */
function milhar2(centavos: number): string {
  const [inteiro, fracao] = ponto2(centavos).split(".");
  const sinal = inteiro.startsWith("-") ? "-" : "";
  const corpo = inteiro.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sinal}${corpo}.${fracao}`;
}

/** (dia, mês, ano) -> AAAA-MM-DD. O mês entra como número OU por extenso. */
function dataIso(dia: string, mes: string, ano: string): string {
  const textoMes = mes.trim();
  const numero = /^\d+$/.test(textoMes)
    ? Number(textoMes)
    : (MESES.get(semAcento(textoMes).toLowerCase()) ?? 0);
  if (!numero) return "";
  return `${String(Number(ano)).padStart(4, "0")}-${String(numero).padStart(2, "0")}-${String(Number(dia)).padStart(2, "0")}`;
}

function dataDe(m: RegExpExecArray | null): string {
  return m ? dataIso(m[1], m[2], m[3]) : "";
}

/** O documento é do cliente? Raiz vazia não casa com nada. */
function eDoCliente(documento: string, raizDoCliente: string): boolean {
  return raizDoCliente !== "" && documento.startsWith(raizDoCliente);
}

function mencionaCliente(linha: string, nomesDoCliente: readonly string[]): boolean {
  const alto = linha.toUpperCase();
  return nomesDoCliente.some((n) => n !== "" && alto.includes(n.toUpperCase()));
}

/**
 * '05.2025 - CATEGORIAS' -> '2025-05'; 'FEVEREIRO 2025' -> '2025-02'.
 *
 * Os dois formatos porque as duas árvores usam convenções diferentes: o acervo
 * de apoio numera o mês e a pasta de contratos escreve por extenso.
 */
export function competenciaDaPasta(nome: string): string {
  const limpo = (nome || "").trim();
  const numerico = /^(\d{2})\.(\d{4})/.exec(limpo);
  if (numerico) return `${numerico[2]}-${numerico[1]}`;
  const extenso = /^([A-Za-zÀ-ÿ]+)\s+(\d{4})$/.exec(limpo);
  if (extenso) {
    const mes = MESES.get(semAcento(extenso[1]).toLowerCase());
    return mes ? `${extenso[2]}-${String(mes).padStart(2, "0")}` : "";
  }
  return "";
}

// ---------------------------------------------------------------------------
// RPA -- Recibo de Pagamento a Autônomo
// ---------------------------------------------------------------------------
//
// ACENTO VIRA CURINGA (o `.` em "Honor.rio"): a cedilha e o til chegam de
// formas diferentes conforme a fonte embutida no PDF, e os lotes de RPA saíram
// de pelo menos quatro geradores. Casar o byte exato quebraria num lote e
// passaria noutro, silenciosamente.
//
// Uma página traz DOIS blocos, e o que eles são muda de lote para lote: dois
// recibos de pessoas diferentes ("RPA - 12-25.pdf") ou duas vias do MESMO
// recibo ("ReciboRPATerc_[1].pdf"). Quem decide é o conteúdo -- `marcarVias`.
//
// Layout de um bloco (o cabeçalho "Empresa :" separa um bloco do seguinte):
//
//   Empresa :176 - BLD LOGISTICA LTDA          Data do serviço : 01/04/2025
//   CNPJ/CEI : 17.122.471/0001-75              Centro de Custo : 7
//   Recebi da empresa acima identificada, ... a importância de R$ 3.724,71
//   Verba Descrição              Referência  Vencimentos  Descontos
//   30    Honorário Autônomo                    3.888,00
//   9105  Inss Contribuinte Individual  11,00               85,53
//   9135  I.S.S.                                            77,76
//   Líquido >>> 3.724,71
//   Nome : ABIMAEL MARIN CAMILO   Inscrição do INSS:212.63438.79.4
//   CPF:101.426.679-35
//   PINHAIS, 30 de Abril de 2025.

const RPA_BLOCO = /Empresa\s*:/i;
const RPA_CABECALHO = /RECIBO\s+DE|Honor.rio\s+Aut.nomo/i;
const RPA_BRUTO = /Honor.rio\s+Aut.nomo\s+([\d.]+,\d{2})/i;
const RPA_LIQUIDO = /quido\s*>+\s*([\d.]+,\d{2})/i;
const RPA_IMPORTANCIA = /import.ncia de\s*R\$\s*([\d.]+,\d{2})/i;
const RPA_NOME = /Nome\s*:\s*(.+?)\s+Inscri./i;
const RPA_NOME_SOLTO = /Nome\s*:\s*(.+?)\s*$/im;
const RPA_CPF = /CPF\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i;
const RPA_SERVICO = /Data do servi.o\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const RPA_CENTRO = /Centro de Custo\s*:\s*(\S+)/i;
// "PINHAIS, 30 de Abril de 2025." -- a data em que o recibo foi emitido.
const RPA_EMISSAO = /,\s*(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+de\s+(\d{4})/;
// A IDENTIDADE DE UMA RETENÇÃO É O CÓDIGO DA VERBA, não o rótulo. A primeira
// versão casava rótulos e guardava um valor por rótulo, até um recibo com três
// linhas de SEST (9401 SEST/SENAT, 9402 SEST, 9403 SENAT): a 9402 era
// descartada e os R$ 15,46 sumiam -- 0,30% do bruto, sistemático.
// O VALOR É O ÚLTIMO NÚMERO DA LINHA (a coluna "Referência" existe em alguns
// lotes e não em outros), e casa DENTRO da linha: atravessar a quebra fazia o
// SENAT sem referência capturar o total da linha seguinte.
const VERBA_RETENCAO = /^\s*(9\d{3})\s+(.+)$/;
const MOEDA = /([\d.]+,\d{2})/g;
// Linha de fechamento do quadro: "5.156,00  268,10" (bruto, total de descontos).
const TOTAIS = /^\s*([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*$/;

/**
 * As retenções do recibo, na ordem impressa. Lista e não mapa porque a mesma
 * família aparece em verbas diferentes (9401 SEST/SENAT convive com 9402 SEST).
 */
export function retencoesDoBloco(bloco: string): Retencao[] {
  const achados: Retencao[] = [];
  for (const linha of linhasDe(bloco)) {
    const casou = VERBA_RETENCAO.exec(linha);
    if (!casou) continue;
    const numeros = linha.match(MOEDA);
    if (!numeros) continue;
    const centavos = valorBrEmCentavos(numeros[numeros.length - 1]);
    if (centavos === null) continue;
    const descricao = apara(casou[2].replace(MOEDA, ""), " .-");
    achados.push({ verba: casou[1], descricao: corta(juntaEspacos(descricao), 60), centavos });
  }
  return achados;
}

/** O total de descontos que o PRÓPRIO PDF imprime, quando ele imprime. */
export function totalDescontosImpresso(bloco: string): number | null {
  for (const linha of linhasDe(bloco)) {
    const casou = TOTAIS.exec(linha);
    if (casou) return valorBrEmCentavos(casou[2]);
  }
  return null;
}

function temLetra(texto: string): boolean {
  return /[A-Za-zÀ-ÿ]/.test(texto);
}

/**
 * Os recibos de UMA página de RPA -- normalmente dois. Lista vazia se não for RPA.
 *
 * O bruto é o "Honorário Autônomo" e o líquido é o "Líquido >>>"; quando este
 * não sai, cai na "importância de R$" do corpo, que é o mesmo número.
 */
export function lerPaginaRpa(texto: string): PagamentoLido[] {
  if (!texto || !RPA_CABECALHO.test(texto)) return [];

  // Corta nos cabeçalhos "Empresa :". O que vem antes do primeiro é lixo de
  // topo de página e é descartado.
  const marcas = todas(RPA_BLOCO, texto).map((m) => m.index);
  if (marcas.length === 0) return [];
  const limites = [...marcas, texto.length];
  const blocos = marcas.map((_, i) => texto.slice(limites[i], limites[i + 1]));

  const recibos: PagamentoLido[] = [];
  for (const bloco of blocos) {
    const bruto = RPA_BRUTO.exec(bloco);
    const liquido = RPA_LIQUIDO.exec(bloco) ?? RPA_IMPORTANCIA.exec(bloco);
    if (!bruto && !liquido) continue; // cabeçalho sem corpo: rodapé, página de rosto

    const nome = RPA_NOME.exec(bloco) ?? RPA_NOME_SOLTO.exec(bloco);
    const cpf = RPA_CPF.exec(bloco);
    const centro = RPA_CENTRO.exec(bloco);
    const retencoes = retencoesDoBloco(bloco);

    let textoNome = nome ? nome[1].trim() : "";
    // O "Nome:" às vezes vem com o próprio CPF. Guardá-lo como nome faria o
    // confronto por nome casar CPF com CPF e PARECER acerto.
    if (!temLetra(textoNome)) textoNome = "";

    recibos.push({
      nome: corta(textoNome, 200),
      documento: cpf ? digitos(cpf[1]) : "",
      numero: "",
      brutoCentavos: bruto ? valorBrEmCentavos(bruto[1]) : null,
      liquidoCentavos: liquido ? valorBrEmCentavos(liquido[1]) : null,
      dataServico: dataDe(RPA_SERVICO.exec(bloco)),
      dataPagamento: dataDe(RPA_EMISSAO.exec(bloco)),
      centroCusto: centro ? corta(centro[1].trim(), 20) : "",
      retencoes: retencoes.length > 0 ? retencoes : null,
      situacao: "ok",
      observacao: "",
    });
  }
  marcarVias(recibos);
  for (const recibo of recibos) conferirAritmetica(recibo);
  return recibos;
}

/** O que faz dois blocos serem o MESMO recibo impresso duas vezes. */
function identidade(r: PagamentoLido): string {
  return JSON.stringify([r.nome, r.documento, r.brutoCentavos, r.liquidoCentavos, r.dataPagamento]);
}

/**
 * Segunda impressão do mesmo recibo NA MESMA PÁGINA vira 'via'.
 *
 * Contar tudo dobra o lote de duas vias; dividir por dois some com metade do
 * lote de dois recibos. O critério é o conteúdo: num formulário gerado em lote,
 * dois pagamentos distintos não coincidem em pessoa, valores e data ao mesmo
 * tempo. A via NÃO é apagada, só marcada -- se o critério errar, o erro fica
 * visível em vez de virar silêncio.
 */
function marcarVias(recibos: PagamentoLido[]): void {
  const vistos = new Map<string, number>();
  for (const recibo of recibos) {
    const chave = identidade(recibo);
    const bloco = vistos.get(chave);
    if (bloco !== undefined) {
      recibo.situacao = "via";
      recibo.observacao = `2ª via do mesmo recibo nesta página (idêntico ao bloco ${bloco})`;
    } else {
      vistos.set(chave, vistos.size + 1);
    }
  }
}

/**
 * bruto - retenções == líquido? Se não, 'conferir' em vez de somar assim mesmo.
 * O RPA declara a conta inteira, e valor que não fecha consigo mesmo não entra
 * em base de PIS/COFINS por omissão. Um centavo de folga para o arredondamento
 * do próprio gerador do PDF.
 */
function conferirAritmetica(recibo: PagamentoLido): void {
  if (recibo.situacao !== "ok") return;
  const bruto = recibo.brutoCentavos;
  const liquido = recibo.liquidoCentavos;
  if (bruto === null || liquido === null) {
    recibo.situacao = "conferir";
    recibo.observacao = bruto === null ? "não li o bruto" : "não li o líquido";
    return;
  }
  const descontos = (recibo.retencoes ?? []).reduce((s, r) => s + r.centavos, 0);
  if (Math.abs(bruto - descontos - liquido) > 1) {
    recibo.situacao = "conferir";
    recibo.observacao =
      `não fecha: bruto ${ponto2(bruto)} - retenções ${ponto2(descontos)} ` +
      `= ${ponto2(bruto - descontos)}, mas o líquido diz ${ponto2(liquido)}`;
  }
}

// ---------------------------------------------------------------------------
// Recibo de motorista (MEI)
// ---------------------------------------------------------------------------
//
// Um PDF, uma página, um recibo, emitido PELO motorista CONTRA o cliente: o
// cabeçalho é o prestador e o CNPJ do cliente aparece no corpo.
//
//   45.262.666 SANDRO MARCEL CAETANO
//   CNPJ
//   45.262.666/0001-56
//   Recebido de: BLD Logística        Número do recibo: 00026
//   CNPJ 17.122.471/0001-75           Data: 13/02/2025
//   Data de pagamento: 10/02/2025
//   Total: R$ 2.870,00
//
// O "Recebido de:" NÃO é confiável (às vezes traz o próprio motorista). Quem
// identifica o prestador é o primeiro CNPJ que não é o do cliente.

const REC_NUMERO = /N.mero do recibo\s*:\s*(\S+)/i;
const REC_TOTAL = /Total\s*:\s*R\$\s*([\d.]+,\d{2})/i;
const REC_DATA_PGTO = /Data de pagamento\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const REC_DATA = /Data\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const REC_CNPJ = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
const REC_CPF = /(?<![\wÀ-ÿ])(\d{11})(?![\wÀ-ÿ])/;

/**
 * O recibo de UM PDF de motorista, ou `null` quando a página não é desse formato.
 *
 * Exige número do recibo E total: são o que distingue este layout dos outros
 * papéis da mesma pasta (fatura de rastreamento, DANFE solta).
 */
export function lerReciboMotorista(
  texto: string,
  raizDoCliente: string,
  nomesDoCliente: readonly string[] = [],
): PagamentoLido | null {
  if (!texto) return null;
  const numero = REC_NUMERO.exec(texto);
  const total = REC_TOTAL.exec(texto);
  if (!numero || !total) return null;

  // O prestador é o PRIMEIRO CNPJ que não seja o do cliente -- "não é o
  // cliente" é o que se quer dizer; confiar na posição quebraria no dia em que
  // o gerador mudar o topo.
  let documento = "";
  for (const achado of todas(REC_CNPJ, texto)) {
    const limpo = digitos(achado[1]);
    if (limpo.length === 14 && !eDoCliente(limpo, raizDoCliente)) {
      documento = limpo;
      break;
    }
  }
  if (!documento) {
    const cpf = REC_CPF.exec(texto);
    documento = cpf ? cpf[1] : "";
  }

  // Nome: a MESMA regra do recibo genérico. Duas regras para a mesma pergunta
  // garantem que uma delas fique errada.
  const nome = nomeDoRecibo(texto, documento, raizDoCliente, nomesDoCliente);

  const pagamento = REC_DATA_PGTO.exec(texto);
  // `Data:` só depois de tirar `Data de pagamento:` -- a expressão curta casa
  // dentro da longa, e a emissão entraria como pagamento.
  const emissao = REC_DATA.exec(texto.split("Data de pagamento").join("DataDePagamento"));
  const valor = valorBrEmCentavos(total[1]);
  const completo = documento !== "" && valor !== null;

  return {
    nome: corta(nome, 200),
    documento,
    numero: corta(numero[1].trim(), 30),
    // O recibo declara UM valor e não discrimina retenção: os dois campos
    // recebem o mesmo número. Não afirma que não houve retenção -- afirma que
    // o documento não a informa.
    brutoCentavos: valor,
    liquidoCentavos: valor,
    dataPagamento: dataDe(pagamento),
    dataServico: dataDe(emissao),
    centroCusto: "",
    retencoes: null,
    situacao: completo ? "ok" : "conferir",
    observacao: completo
      ? ""
      : !documento
        ? "não identifiquei o prestador (nem CNPJ nem CPF)"
        : "não li o total",
  };
}

// ---------------------------------------------------------------------------
// Contrato de motorista -- "RECIBO DE PAGAMENTO DE SERVIÇO"
// ---------------------------------------------------------------------------
//
// Uma página é um pagamento:
//
//   RECIBO DE PAGAMENTO DE SERVIÇO
//   Contratante: BLD Logística LTDA
//   CNPJ: 17.122.471/0001-75
//   Nome: JADIR BYHAIN
//   CPF: 968.672.569-53
//   Valor recebido: R$6250 (seis mil duzentos e cinquenta reais)
//   Data do recebimento: 30 setembro 2025

const CTR_CABECALHO = /RECIBO DE PAGAMENTO DE SERVI/i;
const CTR_NOME = /Nome\s*:\s*(.+?)\s*$/im;
const CTR_CPF = /CPF\s*:\s*([\d.-]{11,14})/i;
// "R$ 439,2", "R$ 1.234,56", "R$ 300" e "1800" seco -- quatro meses saíram sem
// o símbolo, e exigi-lo perderia esses meses inteiros.
const CTR_VALOR = /Valor recebido\s*:\s*(?:R\$\s*)?([\d.]+(?:,\d{1,2})?)/i;
const CTR_DATA = /Data do recebimento\s*:\s*(\d{1,2})\s*(?:de\s+)?([A-Za-zÀ-ÿ]+)\s*(?:de\s+)?(\d{4})/i;

/**
 * O contrato de UMA página, ou `null` quando a página não é contrato. Folha de
 * rosto e página em branco caem no `null` pelo cabeçalho -- é o que impede a
 * capa do lote de virar um pagamento de valor zero.
 */
export function lerContratoMotorista(texto: string, raizDoCliente: string): PagamentoLido | null {
  if (!texto || !CTR_CABECALHO.test(texto)) return null;

  const nome = CTR_NOME.exec(texto);
  const valor = CTR_VALOR.exec(texto);
  const cpf = CTR_CPF.exec(texto);

  let textoNome = nome ? nome[1].trim() : "";
  // Em julho-novembro/2025 o "Nome:" vem com o PRÓPRIO CPF: melhor a linha
  // assumir que não tem nome do que casar CPF com CPF no confronto.
  if (!temLetra(textoNome)) textoNome = "";

  const centavos = valor ? valorBrEmCentavos(valor[1]) : null;
  const registro: PagamentoLido = {
    nome: corta(textoNome, 200),
    documento: cpf ? digitos(cpf[1]) : "",
    numero: "",
    brutoCentavos: centavos,
    liquidoCentavos: centavos,
    dataPagamento: dataDe(CTR_DATA.exec(texto)),
    dataServico: "",
    centroCusto: "",
    retencoes: null,
    situacao: "ok",
    observacao: "",
  };
  // O cliente tem que ser o CONTRATANTE. Sem isso, o recibo de outra empresa
  // que foi parar na pasta entraria como despesa nossa -- pagamento de terceiro
  // na base de PIS/COFINS é o erro que ninguém encontra depois.
  if (raizDoCliente === "" || !digitos(texto).includes(raizDoCliente)) {
    registro.situacao = "invalido";
    registro.observacao = "o cliente não aparece como contratante nesta página";
  } else if (registro.brutoCentavos === null) {
    registro.situacao = "conferir";
    registro.observacao = "não li o valor recebido";
  }
  return registro;
}

// ---------------------------------------------------------------------------
// Contrato de locação de imóvel
// ---------------------------------------------------------------------------
//
// NÃO É UM RECIBO: é UM documento = UM acordo que gera N pagamentos mensais.
// A linha que sai daqui é o CADASTRO do acordo: o bruto é o aluguel mensal e a
// data de pagamento fica VAZIA de propósito (a de assinatura faria doze
// pagamentos virarem um só, na data errada).
//
// Não há layout -- 43 contratos, 43 redatores. O estável são os rótulos
// LOCADOR/LOCATÁRIO e os documentos próximos deles. E o cliente se reconhece
// pelo CNPJ, nunca pelo nome (a BLD aparece com razões sociais antigas).

const LOC_CABECALHO = /LOCA..O|LOCAT.RI|LOCADOR/i;
// O rótulo vem com plural entre parênteses -- "LOCADOR(ES)(AS)", "LOCATÁRIO(A)".
// Sem consumir o sufixo, o "(es)" sobra e vira o NOME da parte.
const SUFIXO_PLURAL = String.raw`(?:\s*\((?:[A-Za-z]{1,3})\))*\s*:?`;
const LOC_LOCADOR = new RegExp(String.raw`LOCADOR(?:A|ES|AS|A?S)?` + SUFIXO_PLURAL, "i");
const LOC_LOCATARIO = new RegExp(String.raw`LOCAT.RI(?:O|A|OS|AS)?` + SUFIXO_PLURAL, "i");
const DOC_QUALQUER =
  /(\d{2}[.\s]?\d{3}[.\s]?\d{3}\/\s?\d{4}-?\s?\d{2}|\d{3}[.\s-]?\d{3}[.\s-]?\d{3}\s?[-.]?\s?\d{2})/;
// "doravante denominado(a)(s) LOCATÁRIO", "chamada simplesmente LOCADORA": o
// rótulo FECHA a qualificação de quem veio antes. Até duas palavras entre o
// verbo e o rótulo.
const ROTULO_FECHA =
  /(?:denominad|chamad|designad|qualificad)[oa]s?(?:\([a-z]{1,3}\))*(?:[^\wÀ-ÿ]+[\wÀ-ÿ]+){0,2}[^\wÀ-ÿ]*$/i;
// Onde termina a qualificação de uma parte e começa a da outra no mesmo
// parágrafo: "celebra(am) com", "de outro lado", "e, de outra parte".
const SEPARA_PARTES =
  /celebra[\wÀ-ÿ]*(?:\([a-z]{1,3}\))*\s+com|de\s+outr[oa]\s+(?:lado|parte)|,?\s+e,?\s+de\s+outr[oa](?![\wÀ-ÿ])/i;
const LOC_ALUGUEL = /aluguel[^.]{0,120}?R\$\s*([\d.]+(?:,\d{2})?)/i;
// 400 caracteres cobrem nome + qualificação + documento nos 43 contratos, sem
// alcançar o rótulo da parte seguinte.
const JANELA_PARTE = 400;

/** (nome, documento) da parte identificada por `rotulo`. Vazio quando não achar. */
function parte(texto: string, rotulo: RegExp): [string, string] {
  const achado = rotulo.exec(texto);
  if (!achado) return ["", ""];
  const fim = achado.index + achado[0].length;
  const janela = texto.slice(fim, fim + JANELA_PARTE);
  let documento = "";
  for (const candidato of todas(DOC_QUALQUER, janela)) {
    const limpo = digitos(candidato[1]);
    if (limpo.length === 11 || limpo.length === 14) {
      documento = limpo;
      break;
    }
  }
  // O nome é o que vem antes da primeira vírgula ou do documento ("KATIA MARA
  // PEREIRA SANTANA, brasileira, ..."): cortar na vírgula evita arrastar a
  // qualificação inteira.
  const bruto = janela.split(/,|CPF|CNPJ|RG|brasileir/)[0];
  return [corta(apara(juntaEspacos(bruto.replace(/\n/g, " ")), " :-"), 200), documento];
}

type PapelDaParte = "locadora" | "locataria";
type Marca = { pos: number; papel: PapelDaParte; fecha: boolean };
type Opcao = [number, number, PapelDaParte];

function comparaOpcao(a: Opcao, b: Opcao): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
}

function menor(opcoes: Opcao[]): Opcao {
  return opcoes.reduce((m, o) => (comparaOpcao(o, m) < 0 ? o : m));
}

/**
 * Em que papel o cliente aparece no contrato: 'locataria', 'locadora' ou ''.
 * Era o `papel_da_bld`.
 *
 * PROCURA O CNPJ E OLHA PARA TRÁS, em vez de procurar o rótulo e olhar para a
 * frente: em contrato de parágrafo corrido a qualificação tem tamanho
 * imprevisível, e o CNPJ cai fora de qualquer janela fixa.
 *
 * UM RÓTULO ABRE OU FECHA A QUALIFICAÇÃO. "LOCATÁRIO: BLD ..." abre e vale para
 * o que vem depois; "BLD ..., doravante denominado LOCATÁRIO" fecha e vale
 * para o que veio antes. Rótulo de fechamento não conta para trás; para a
 * frente só ele conta (até 800 caracteres). Um rótulo de abertura deixa de
 * valer se, entre ele e o CNPJ, a parte já foi fechada ou o texto passou para
 * a outra parte ("celebra com", "de outro lado"). Sobrando os dois, vence o
 * mais perto (no empate, o que fecha). Cada ocorrência do CNPJ vota; a
 * maioria decide.
 */
export function papelDoCliente(texto: string, raizDoCliente: string): PapelDaParte | "" {
  const marcas: Marca[] = [];
  for (const [expressao, papel] of [
    [LOC_LOCADOR, "locadora"],
    [LOC_LOCATARIO, "locataria"],
  ] as const) {
    for (const m of todas(expressao, texto)) {
      const fecha = ROTULO_FECHA.test(texto.slice(Math.max(0, m.index - 60), m.index));
      marcas.push({ pos: m.index, papel, fecha });
    }
  }
  if (marcas.length === 0) return "";
  marcas.sort((a, b) =>
    a.pos !== b.pos ? a.pos - b.pos : a.papel !== b.papel ? (a.papel < b.papel ? -1 : 1) : Number(a.fecha) - Number(b.fecha),
  );

  /** O rótulo de abertura em `pos` ainda fala da parte cujo documento está em `ate`? */
  const aindaAbre = (pos: number, ate: number): boolean => {
    if (marcas.some((m) => m.fecha && pos < m.pos && m.pos < ate)) return false;
    return !SEPARA_PARTES.test(texto.slice(pos, ate));
  };

  const votos: PapelDaParte[] = [];
  for (const candidato of todas(DOC_QUALQUER, texto)) {
    if (!eDoCliente(digitos(candidato[1]), raizDoCliente)) continue;
    const inicio = candidato.index;
    const fim = inicio + candidato[0].length;
    const antes: Opcao[] = marcas
      .filter((m) => m.pos < inicio && !m.fecha && aindaAbre(m.pos, inicio))
      .map((m) => [inicio - m.pos, 1, m.papel]);
    const depois: Opcao[] = marcas
      .filter((m) => fim <= m.pos && m.pos <= fim + 800 && m.fecha)
      .map((m) => [m.pos - fim, 0, m.papel]);
    const opcoes = [...(antes.length ? [menor(antes)] : []), ...(depois.length ? [menor(depois)] : [])];
    if (opcoes.length) votos.push(menor(opcoes)[2]);
  }
  if (votos.length === 0) return "";
  // A maioria; no empate, o primeiro a aparecer.
  const ordem = [...new Set(votos)];
  const conta = (p: PapelDaParte) => votos.filter((v) => v === p).length;
  return ordem.reduce((m, p) => (conta(p) > conta(m) ? p : m));
}

/**
 * O texto tem a cara de um CONTRATO de locação, e não só a palavra "locação"?
 *
 * Existe para o importador olhar conteúdo onde olharia pasta: um contrato
 * guardado em pasta de recibo entraria como pagamento. EXIGE AS DUAS PARTES --
 * a palavra "LOCAÇÃO" sozinha aparece em recibo de aluguel e em nome de
 * fornecedor, e alerta que sempre acende deixa de ser lido.
 */
export function pareceContratoLocacao(texto: string): boolean {
  if (!texto) return false;
  return LOC_LOCADOR.test(texto) && LOC_LOCATARIO.test(texto);
}

/**
 * O cadastro de UM contrato de locação, lido do texto inteiro do PDF.
 *
 * `valorNoNomeCentavos` é o valor do NOME DO ARQUIVO ("CONTRATO - ANAGE -
 * R$5800,00.pdf"). Ele NUNCA vira o valor: quando diverge do aluguel lido, vale
 * o CONTRATO e a divergência vira observação -- o nome foi digitado por gente.
 */
export function lerContratoLocacao(
  texto: string,
  raizDoCliente: string,
  valorNoNomeCentavos: number | null = null,
): PagamentoLido | null {
  if (!texto || !LOC_CABECALHO.test(texto)) return null;

  const [nomeLocador, docLocador] = parte(texto, LOC_LOCADOR);
  const [nomeLocatario, docLocatario] = parte(texto, LOC_LOCATARIO);
  const aluguel = LOC_ALUGUEL.exec(texto);
  const valor = aluguel ? valorBrEmCentavos(aluguel[1]) : null;

  const registro: PagamentoLido = {
    // O FORNECEDOR É O LOCADOR -- é a ele que o cliente paga. O locatário é o
    // próprio cliente: serve para validar, não para lançar.
    nome: nomeLocador,
    documento: docLocador,
    numero: "",
    brutoCentavos: valor,
    liquidoCentavos: valor,
    dataPagamento: "",
    dataServico: "",
    centroCusto: "",
    retencoes: null,
    situacao: "ok",
    observacao: "",
  };

  const avisos: string[] = [];
  const papel = papelDoCliente(texto, raizDoCliente);
  if (papel !== "locataria") {
    registro.situacao = "invalido";
    if (!papel) {
      avisos.push(
        "o CNPJ do cliente não aparece neste contrato (locatário: " +
          (nomeLocatario || docLocatario || "não identificado") +
          ")",
      );
    } else {
      // Cliente locador é o cliente RECEBENDO aluguel -- receita, não despesa;
      // confundir os lados inverteria o sinal do lançamento.
      avisos.push("o cliente aparece como LOCADOR, não como locatário -- este contrato é de receita, não de despesa");
    }
  } else if (valor === null) {
    registro.situacao = "conferir";
    avisos.push("não li o valor do aluguel no texto do contrato");
  }
  if (valor !== null && valorNoNomeCentavos !== null && valor !== valorNoNomeCentavos) {
    // NÃO troca o valor -- só avisa.
    avisos.push(
      `o nome do arquivo diz R$ ${milhar2(valorNoNomeCentavos)} e o contrato diz R$ ${milhar2(valor)}; vale o contrato`,
    );
    if (registro.situacao === "ok") registro.situacao = "conferir";
  }
  registro.observacao = avisos.join(" | ");
  return registro;
}

const VALOR_NO_NOME = /R\$\s*R?\$?\s*([\d.]+(?:,\d{2})?)/i;

/**
 * O valor escrito no nome do arquivo, em centavos. CONFERÊNCIA, nunca fonte.
 * Aceita o "R$R$8.500,00" de quem digitou o símbolo duas vezes.
 */
export function valorDoNomeArquivo(nome: string): number | null {
  const achado = VALOR_NO_NOME.exec(nome || "");
  return achado ? valorBrEmCentavos(achado[1]) : null;
}

// ---------------------------------------------------------------------------
// Recibo genérico -- o que não bate em nenhum layout conhecido
// ---------------------------------------------------------------------------
//
// Dos recibos com texto, a maioria não bate no layout MEI e se espalha por
// dezenas de emissores. Um parser por emissor é trabalho infinito; um que
// procura os três campos onde quer que estejam cobre a maioria de uma vez.
//
// E ELE NÃO PODE INVENTAR NÚMERO:
//   valor rotulado ("Total: R$ 1.551,50")  -> confiável, entra 'ok'
//   valor sem rótulo (o maior R$ da página) -> palpite, entra 'conferir'
// O palpite vai preenchido para quem confere aceitar ou corrigir.

const REC_ROTULO_VALOR =
  /(?:total|valor\s+total|valor\s+a\s+pagar|valor\s+pago|valor|import[âa]ncia)[^\dR$]{0,12}R?\$?\s*([\d.]{1,12},\d{2})/i;
const REC_QUALQUER_VALOR = /R\$\s*([\d.]{1,12},\d{2})/;
const REC_DATA_ROTULADA =
  /(?:data\s+(?:de\s+)?(?:pagamento|vencimento|emiss[ãa]o)|pago\s+em)[^\d]{0,10}(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const REC_DATA_QUALQUER = /(?<![\wÀ-ÿ])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\wÀ-ÿ])/;
const REC_DOC = /(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/;

/** A raiz do cliente tolerante a espaço e ponto ("1 7.1 2 2.4 7 1"). */
function raizTolerante(raizDoCliente: string): RegExp | null {
  if (!/^\d{8}$/.test(raizDoCliente)) return null;
  const d = raizDoCliente.split("");
  return new RegExp(
    `${d[0]}\\s?${d[1]}\\.?\\s?${d[2]}\\s?${d[3]}\\s?${d[4]}\\.?\\s?${d[5]}\\s?${d[6]}\\s?${d[7]}`,
  );
}

// O NOME DO FORNECEDOR. A regra antiga ("a primeira linha com letras") pegava a
// palavra RECIBO em um quarto dos recibos. A regra nova ANCORA NO DOCUMENTO: o
// nome está ao lado do CPF/CNPJ do fornecedor, na mesma linha ou logo acima. E
// o que nunca é nome fica numa lista explícita -- nome vazio se vê na
// conferência, nome errado passa.
const NAO_E_NOME = new RegExp(
  "^(recibo|comprovante|declara|nota\\s+fiscal|documento|fatura|duplicata|" +
    "cnpj|cpf|telefone|e-?mail|endere|rua|av\\.|avenida|rodovia|bairro|cep|" +
    "cliente|recebido\\s+de|forma\\s+de\\s+pagamento|data|tipo|descri|valor|total|" +
    "servi[çc]os?(?![\\wÀ-ÿ])|refer[êe]nte|per[íi]odo|vencimento|inscri|eu,?\\s|" +
    "pagamento(?![\\wÀ-ÿ])|pix(?![\\wÀ-ÿ])|transfer[êe]ncia)",
  "i",
);
// Linha que é dinheiro: "R$ 1.551,50", "5 x 103,80 519,00".
const LINHA_DE_VALOR = /R\$|\d{1,3}(?:\.\d{3})*,\d{2}/;
// VALOR POR EXTENSO ("a importância de Duzentos e setenta e cinco reais"): não
// tem algarismo, passa pelo filtro acima e viraria o nome do fornecedor.
const VALOR_POR_EXTENSO = /(?<![\wÀ-ÿ])(?:reais|centavos|import[âa]ncia|quantia|referente\s+a)(?![\wÀ-ÿ])/i;
// "Venda 3793", "Pedido 12" -- rótulo de operação do sistema do emissor.
const ROTULO_OPERACAO = /^(?:venda|pedido|or[çc]amento|os|ordem)\s*n?[º°.]?\s*\d/i;
// CPF sem pontuação colado no fim da razão social do MEI.
const DIGITOS_COLADOS = /[\s.\-/]*(?<![\wÀ-ÿ])\d{11,14}(?![\wÀ-ÿ])\s*$/;
// O documento ROTULADO no fim da linha ("Ezequiel ... CPF no 128.911.977-5").
const DOC_ROTULADO_FIM = /[,\s]*(?<![\wÀ-ÿ])(?:CPF|CNPJ|MEI)(?![\wÀ-ÿ])[^\d]{0,8}[\d.\-/]{6,20}\s*$/i;
// Marca d'água de aplicativo de digitalização.
const SCANNER = /scanned\s+by|tapscanner|camscanner|digitalizado\s+(?:com|por)/i;

// O NOME DENTRO DE UMA FRASE: "Eu, FULANO, inscrito no CPF...", "Serviços
// realizados pelo motorista FULANO", "via Pix ... EM NOME DE Fulana". Nelas a
// linha inteira não é o nome -- só um pedaço dela.
const FRASES_COM_NOME = [
  /(?<![\wÀ-ÿ])Eu,?\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.\s]{4,60}?)\s*,?\s*(?:inscrit|portador|brasileir|CPF|RG|residente)/i,
  /(?:motorista|prestador(?:\s+de\s+servi[çc]os?)?|favorecid[oa]|credor[a]?|recebed[oa]r|aut[ôo]nomo)\s*:?\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.\s]{4,60})/i,
  /(?<![\wÀ-ÿ])em\s+nome\s+de\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`.\s]{4,60})/i,
];
// Conectivos que a frase deixa grudados no fim do nome ("DIEGO MONTEIRO no dia
// 12"). `de`, `da`, `dos` FICAM DE FORA: em nome brasileiro são partícula, e
// cortar nelas deixaria o nome pela metade -- pior que com sobra, porque
// parece certo.
const RABICHO =
  /\s+(?:no|na|nos|nas|em|referente|conforme|pelo|pela|para|durante|com|que|cpf|cnpj|conforme)(?![\wÀ-ÿ]).*$/i;
// "Nome: Emerson Kuczera", "Favorecido - JOAO SILVA": o rótulo é do formulário.
const ROTULO_DE_NOME = /^(?:nome|favorecid[oa]|credor[a]?|recebed[oa]r|prestador)\s*[:-]\s*/i;

/** O nome quando ele está no meio de uma frase, não numa linha só dele. */
function nomeEmFrase(texto: string): string {
  for (const padrao of FRASES_COM_NOME) {
    const achado = padrao.exec(texto || "");
    if (!achado) continue;
    const nome = apara(juntaEspacos(achado[1].trim().replace(RABICHO, "")), " ,.-");
    // DOIS NOMES, NO MÍNIMO: "Eu, João" sozinho não identifica ninguém.
    if (nome.length >= 5 && nome.split(/\s+/).filter(Boolean).length >= 2) return corta(nome, 200);
  }
  return "";
}

/** A linha limpa, ou vazio se ela não puder ser nome de ninguém. */
function candidatoANome(linha: string, raizDoCliente: string, nomesDoCliente: readonly string[]): string {
  let limpo = juntaEspacos(linha || "").replace(ROTULO_DE_NOME, "");
  // Documento no começo ("45.262.666 SANDRO...") não é do nome; no fim, também não.
  limpo = limpo.replace(/^[\d.\-/\s]+/, "");
  limpo = limpo.replace(DOC_ROTULADO_FIM, "");
  limpo = apara(limpo.replace(DIGITOS_COLADOS, ""), " -–:.");
  if (SCANNER.test(limpo)) return "";
  // A LINHA PODE SER A FRASE ("Serviços realizados pelo motorista DIEGO"): o
  // nome está dentro dela, e vale também para a linha achada pela âncora.
  const dentro = nomeEmFrase(limpo);
  if (dentro) return dentro;
  if (limpo.length < 5 || !/[A-Za-zÀ-ÿ]{3}/.test(limpo)) return "";
  const raiz = raizTolerante(raizDoCliente);
  if ((raiz && raiz.test(limpo)) || mencionaCliente(limpo, nomesDoCliente)) return "";
  if (NAO_E_NOME.test(limpo) || LINHA_DE_VALOR.test(limpo)) return "";
  if (VALOR_POR_EXTENSO.test(limpo) || ROTULO_OPERACAO.test(limpo)) return "";
  // Uma linha que é mais número que letra não é nome.
  const chars = Array.from(limpo);
  const letras = chars.filter((c) => LETRA.test(c)).length;
  if (letras < chars.length * 0.5) return "";
  return corta(limpo, 200);
}

/**
 * O nome do fornecedor no recibo. Vazio quando não dá para afirmar.
 *
 * Nesta ordem: a fórmula explícita sobre o texto com as quebras desfeitas ("em
 * nome de FULANO" -- onde o nome costuma atravessar a quebra de linha), a
 * vizinhança do documento (a linha dele e as três acima) e, por fim, a
 * primeira linha aceitável da página.
 */
export function nomeDoRecibo(
  texto: string,
  documento = "",
  raizDoCliente = "",
  nomesDoCliente: readonly string[] = [],
): string {
  const linhas = linhasDe(texto || "");

  let nome = nomeEmFrase(juntaEspacos(texto || ""));
  if (nome) return nome;

  if (documento) {
    // TRÊS ACIMA porque a razão social quebra em duas e ainda pode haver um
    // rótulo no meio; mais que isso alcança o cabeçalho do documento.
    for (let i = 0; i < linhas.length; i++) {
      if (!digitos(linhas[i]).includes(documento)) continue;
      nome = candidatoANome(linhas[i], raizDoCliente, nomesDoCliente);
      if (nome) return nome;
      for (const anterior of linhas.slice(Math.max(0, i - 3), i).reverse()) {
        nome = candidatoANome(anterior, raizDoCliente, nomesDoCliente);
        if (nome) return nome;
      }
      break;
    }
  }

  for (const linha of linhas) {
    nome = candidatoANome(linha, raizDoCliente, nomesDoCliente);
    if (nome) return nome;
  }
  return "";
}

/**
 * Um recibo de layout desconhecido, ou `null` quando não dá para afirmar nada.
 * Só sai 'ok' quando o valor estava rotulado E há contraparte identificada.
 */
export function lerReciboGenerico(
  texto: string,
  raizDoCliente: string,
  nomesDoCliente: readonly string[] = [],
): PagamentoLido | null {
  if (!texto || !texto.trim()) return null;

  // A contraparte: o primeiro documento que NÃO é do cliente.
  let documento = "";
  for (const achado of todas(REC_DOC, texto)) {
    const limpo = digitos(achado[1]);
    if ((limpo.length === 11 || limpo.length === 14) && !eDoCliente(limpo, raizDoCliente)) {
      documento = limpo;
      break;
    }
  }

  const rotulado = REC_ROTULO_VALOR.exec(texto);
  let valor = rotulado ? valorBrEmCentavos(rotulado[1]) : null;
  let palpiteValor = false;
  if (valor === null) {
    // Sem rótulo: o MAIOR valor da página (o total costuma ser o maior número
    // de um recibo) -- e, por ser palpite, a linha sai 'conferir'.
    const candidatos = todas(REC_QUALQUER_VALOR, texto)
      .map((m) => valorBrEmCentavos(m[1]))
      .filter((v): v is number => v !== null);
    if (candidatos.length) {
      valor = Math.max(...candidatos);
      palpiteValor = true;
    }
  }

  const dataRotulada = REC_DATA_ROTULADA.exec(texto);
  let data: string;
  let palpiteData = false;
  if (dataRotulada) {
    data = dataDe(dataRotulada);
  } else {
    data = dataDe(REC_DATA_QUALQUER.exec(texto));
    palpiteData = data !== "";
  }

  if (valor === null && !documento) return null; // nem quem nem quanto

  const nome = nomeDoRecibo(texto, documento, raizDoCliente, nomesDoCliente);

  const motivos: string[] = [];
  if (palpiteValor && valor !== null) motivos.push(`valor não estava rotulado — usei o maior da página (R$ ${milhar2(valor)})`);
  if (palpiteData) motivos.push("data não estava rotulada — usei a primeira da página");
  if (!documento) motivos.push("não identifiquei CNPJ/CPF da contraparte");
  // NOME VAZIO É PENDÊNCIA: agora que a regra recusa o que não é nome, a recusa
  // precisa aparecer na fila.
  if (!nome) motivos.push("não identifiquei o nome do fornecedor");
  if (valor === null) motivos.push("não achei valor nenhum");

  return {
    nome,
    documento,
    numero: "",
    brutoCentavos: valor,
    liquidoCentavos: valor,
    dataPagamento: data,
    dataServico: "",
    centroCusto: "",
    retencoes: null,
    situacao: motivos.length ? "conferir" : "ok",
    observacao: corta(motivos.join(" | "), 300),
  };
}

// ---------------------------------------------------------------------------
// Fatura de locação -- Localiza Rent a Car, Localiza Fleet e congêneres
// ---------------------------------------------------------------------------
//
// A mais bem-comportada das famílias: documento de sistema, rótulo em tudo.
//
//   FATURA / DUPLICATA Nº: CAMTZ - 837273
//   CLIENTE: BLD LOGISTICA LTDA        CÓDIGO: 12577500
//   CNPJ: 17.122.471/0001-75           DATA DE EMISSÃO: 05/01/2025
//   LOCAÇÃO DE VEÍCULOS, CONFORME ANEXO.             R$ 53.726,25
//   VENCIMENTO      CONDIÇÕES DE PAGAMENTO      VALOR TOTAL
//   10/02/2025      A PRAZO                     R$ 53.726,25
//
// A DATA QUE VALE É A DE EMISSÃO: o vencimento pode cair no mês seguinte, e
// usá-lo jogaria a despesa de janeiro na competência de fevereiro. O
// fornecedor é o emitente: o primeiro CNPJ que NÃO é o do cliente.

const FAT_CABECALHO = /FATURA|DUPLICATA/i;
const FAT_NUMERO = /(?:FATURA\s*\/?\s*DUPLICATA|FATURA|DUPLICATA)[^\n:]{0,24}:?\s*([A-Z0-9][A-Z0-9\s\-./]{2,28})/i;
const FAT_EMISSAO = /(?:DATA\s+(?:DE\s+)?EMISS[ÃA]O|EMISS[ÃA]O)[^\d]{0,10}(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const FAT_VENCIMENTO = /VENCIMENTO[^\d]{0,40}(\d{1,2})\/(\d{1,2})\/(\d{4})/i;
const FAT_TOTAL = /VALOR\s+TOTAL[^\d]{0,30}R?\$?\s*([\d.]{1,14},\d{2})/i;
const FAT_QUALQUER_VALOR = /R\$\s*([\d.]{1,14},\d{2})/;
// O que está sendo alugado decide entre veículo, imóvel e máquina. Separador
// `\s*` E NÃO `\s+`: o pdfplumber extrai parte destas faturas SEM ESPAÇO entre
// as palavras ("LOCAÇÃODEVEÍCULOSPESADOS").
export const FATURA_VEICULO = /LOCA[ÇC][ÃA]O\s*DE\s*VE[ÍI]CULO|RENT\s*A\s*CAR|FLEET|FROTA/i;
// `SALA` e `GALPÃO` EXIGEM o contexto de locação: soltas, são palavras de
// ENDEREÇO do emitente ("ANDAR 9, SALA 210"), e catorze caminhões viravam
// aluguel de imóvel.
export const FATURA_IMOVEL =
  /(?:LOCA[ÇC][ÃA]O|ALUGUEL)\s*DE\s*(?:IM[ÓO]VEL|SALA|GALP[ÃA]O|CONJUNTO\s*COMERCIAL)/i;
// `EQUIPAMENTO` também exige o contexto: a razão social "VAMOS LOCAÇÃO DE
// CAMINHÕES, MÁQUINAS E EQUIPAMENTOS" no cabeçalho fazia toda fatura dela virar
// máquina. `EMPILHADEIRA` fica solta: é uma máquina específica.
export const FATURA_MAQUINA = /(?:LOCA[ÇC][ÃA]O|ALUGUEL)\s*DE\s*(?:M[ÁA]QUINA|EQUIPAMENTO)|EMPILHADEIRA/i;

/**
 * Veículo, imóvel ou máquina -- lido do que a fatura diz estar alugando, nunca
 * do nome de quem emitiu. Veículo é o desempate.
 */
export function categoriaFatura(texto: string): string {
  if (FATURA_MAQUINA.test(texto)) return "fatura_aluguel_maquina";
  if (FATURA_IMOVEL.test(texto) && !FATURA_VEICULO.test(texto)) return "fatura_aluguel_imovel";
  return "fatura_aluguel_veiculo";
}

/** Uma fatura de locação, ou `null` quando a página não é fatura. */
export function lerFatura(
  texto: string,
  raizDoCliente: string,
  nomesDoCliente: readonly string[] = [],
): PagamentoLido | null {
  if (!texto || !FAT_CABECALHO.test(texto)) return null;

  let documento = "";
  for (const achado of todas(REC_DOC, texto)) {
    const limpo = digitos(achado[1]);
    if (limpo.length === 14 && !eDoCliente(limpo, raizDoCliente)) {
      documento = limpo;
      break;
    }
  }

  const total = FAT_TOTAL.exec(texto);
  let valor = total ? valorBrEmCentavos(total[1]) : null;
  let palpite = false;
  if (valor === null) {
    const candidatos = todas(FAT_QUALQUER_VALOR, texto)
      .map((m) => valorBrEmCentavos(m[1]))
      .filter((v): v is number => v !== null);
    if (candidatos.length) {
      valor = Math.max(...candidatos);
      palpite = true;
    }
  }

  const emissao = FAT_EMISSAO.exec(texto);
  const vencimento = FAT_VENCIMENTO.exec(texto);
  const numero = FAT_NUMERO.exec(texto);

  // O nome do emitente: a primeira linha com letras que não seja o cliente.
  let nome = "";
  for (const linha of linhasDe(texto)) {
    const limpo = juntaEspacos(linha);
    if (limpo.length < 5 || !/[A-Za-zÀ-ÿ]{3}/.test(limpo)) continue;
    if (mencionaCliente(limpo, nomesDoCliente)) continue;
    nome = corta(limpo, 200);
    break;
  }

  const avisos: string[] = [];
  if (palpite && valor !== null) avisos.push(`não achei 'VALOR TOTAL' rotulado — usei o maior da página (R$ ${milhar2(valor)})`);
  if (!emissao) avisos.push("não achei a data de emissão" + (vencimento ? " — a competência saiu do vencimento" : ""));
  if (!documento) avisos.push("não identifiquei o CNPJ do emitente");
  if (valor === null) avisos.push("não achei valor nenhum");

  return {
    nome,
    documento,
    numero: numero ? corta(juntaEspacos(numero[1]), 30) : "",
    brutoCentavos: valor,
    liquidoCentavos: valor,
    // Emissão primeiro; o vencimento só como reserva.
    dataPagamento: emissao ? dataDe(emissao) : dataDe(vencimento),
    dataServico: dataDe(vencimento),
    centroCusto: "",
    retencoes: null,
    categoria: categoriaFatura(texto),
    situacao: avisos.length ? "conferir" : "ok",
    observacao: corta(avisos.join(" | "), 300),
  };
}
