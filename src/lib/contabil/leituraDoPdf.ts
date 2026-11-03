// A leitura de um PDF de pagamento sem nota (03/11/2026), portada do laço de
// `varrer` em `importacao_apoio.py` (SPED Generator): qual leitor roda para
// qual tipo, e o que vira linha. Puro: recebe o texto de cada página (quem
// extrai o texto do PDF é outro módulo) e devolve as linhas.
//
// TODO ARQUIVO VIRA LINHA. Uma por pagamento lido; e o arquivo em que nada
// bateu vira UMA linha 'invalido' (página 0) com o motivo -- a lápide. Arquivo
// que some em silêncio é pagamento que ninguém confere.
//
// O CONTEÚDO MANDA, NÃO A PASTA. O tipo vem de onde o arquivo foi enviado, mas
// RPA achado como recibo e contrato de locação achado fora do lugar sobem como
// 'conferir', com o motivo dito: o importador aponta, quem decide o tipo é
// gente, na conferência.
//
// O que mudou na vinda:
// - não há OCR no Connect: página sem camada de texto conta como vazia, e o
//   PDF todo de imagem vira a lápide "PDF de imagem — preencha os valores à
//   mão" (o motor mandava rodar com --ocr);
// - a raiz do CNPJ do cliente é parâmetro, não global;
// - a planilha do BPO (`tipo='fatura'` vinda do relatório) é lida em outro
//   lugar; aqui só a fatura em PDF;
// - dinheiro em centavos inteiros; a chave de negócio (`db.chave_negocio_pagamento`)
//   formata o valor em reais com duas casas, como no motor, para casar com as
//   chaves já gravadas.

import {
  competenciaDaPasta,
  corta,
  digitos,
  lerContratoLocacao,
  lerContratoMotorista,
  lerFatura,
  lerPaginaRpa,
  lerReciboGenerico,
  lerReciboMotorista,
  pareceContratoLocacao,
  valorDoNomeArquivo,
  type PagamentoLido,
} from "./leitoresDePagamento";

export type RegistroLido = {
  pagina: number;
  ordem: number;
  tipo: "rpa" | "recibo" | "contrato_motorista" | "contrato_locacao" | "fatura";
  competencia: string;
  nome: string;
  documento: string;
  numero: string;
  dataPagamento: string;
  dataServico: string;
  brutoCentavos: number | null;
  liquidoCentavos: number | null;
  retencoes: { verba: string; descricao: string; centavos: number }[] | null;
  categoria: string;
  situacao: "ok" | "via" | "conferir" | "invalido";
  observacao: string;
  chaveNegocio: string;
};

/**
 * A chave de negócio de um pagamento, legível: `tipo|quem|data|valor[|discriminador]`.
 *
 * `documento` VEM ANTES DE `nome`, e o nome só entra sem documento: CPF/CNPJ
 * identifica a pessoa, o nome é o campo que mais falha na leitura.
 *
 * Devolve "" sem documento NEM nome: agrupar só por data e valor juntaria
 * pagamentos de gente diferente.
 *
 * `discriminador` separa o que o documento já separou (as linhas por veículo
 * de uma mesma fatura do BPO, que não são duplicata).
 */
export function chaveNegocioPagamento(
  tipo: string,
  documento: string,
  nome: string,
  dataPagamento: string,
  centavos: number | null,
  discriminador = "",
): string {
  const quem = digitos(documento || "") || (nome || "").toUpperCase().split(/\s+/).filter(Boolean).join(" ");
  if (!quem) return "";
  let valor = "";
  if (centavos !== null) {
    const abs = Math.abs(centavos);
    valor = `${centavos < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  }
  const sufixo = String(discriminador || "").trim() ? `|${discriminador}` : "";
  return corta(`${tipo}|${quem}|${dataPagamento || ""}|${valor}${sufixo}`, 120);
}

/**
 * AAAA-MM do pagamento. A DATA LIDA NO DOCUMENTO vem primeiro: pagamento >
 * serviço > pasta. A pasta é o que alguém decidiu ao arquivar, e é onde o erro
 * humano mora (o RPA de agosto numa pasta `07.2025 - CATEGORIAS`).
 */
export function competenciaDoPagamento(
  registro: Pick<PagamentoLido, "dataPagamento" | "dataServico">,
  partesDoCaminho: string[],
): string {
  for (const valor of [registro.dataPagamento, registro.dataServico]) {
    if ((valor || "").length >= 7) return valor.slice(0, 7);
  }
  for (const parte of partesDoCaminho) {
    const achado = competenciaDaPasta(parte);
    if (achado) return achado;
  }
  return "";
}

const VAZIO: PagamentoLido = {
  nome: "",
  documento: "",
  numero: "",
  brutoCentavos: null,
  liquidoCentavos: null,
  dataPagamento: "",
  dataServico: "",
  centroCusto: "",
  retencoes: null,
  situacao: "ok",
  observacao: "",
};

/**
 * As linhas de UM PDF: uma por pagamento lido, ou uma lápide 'invalido' quando
 * nenhuma página bateu. `paginas[i]` é o texto da página i+1 ("" sem camada de
 * texto).
 */
export function lerDocumento(entrada: {
  tipo: RegistroLido["tipo"];
  arquivo: string;
  pasta: string;
  paginas: string[];
  raizDoCliente: string;
  /** Nomes que nunca são o fornecedor (ex.: "BLD", "BATEL"). Opcional. */
  nomesDoCliente?: readonly string[];
}): RegistroLido[] {
  const { tipo, arquivo, pasta, paginas, raizDoCliente } = entrada;
  const nomes = entrada.nomesDoCliente ?? [];
  // As partes do caminho relativo, como o `Path.parts` do motor: as pastas e,
  // por último, o próprio arquivo ("05.2025 - RPA.pdf" também diz o mês).
  const partes = [...(pasta || "").split(/[\\/]/).filter(Boolean), arquivo].filter(Boolean);

  const linha = (pagina: number, ordem: number, r: PagamentoLido): RegistroLido => ({
    pagina,
    ordem,
    tipo,
    competencia: competenciaDoPagamento(r, partes),
    nome: r.nome,
    documento: r.documento,
    numero: r.numero,
    dataPagamento: r.dataPagamento,
    dataServico: r.dataServico,
    brutoCentavos: r.brutoCentavos,
    liquidoCentavos: r.liquidoCentavos,
    retencoes: r.retencoes,
    categoria: r.categoria ?? "",
    situacao: r.situacao,
    observacao: corta(r.observacao || "", 300),
    chaveNegocio: chaveNegocioPagamento(tipo, r.documento, r.nome, r.dataPagamento, r.brutoCentavos),
  });

  const saida: RegistroLido[] = [];
  let vazias = 0;
  // O CONTRATO DE LOCAÇÃO É O DOCUMENTO INTEIRO, não a página: as partes estão
  // na primeira folha e o valor pode estar três páginas adiante. O texto é
  // acumulado e lido uma vez só, depois do laço.
  const paginasContrato: string[] = [];

  paginas.forEach((bruto, i) => {
    const numero = i + 1;
    const conteudo = bruto ?? "";
    if (!conteudo.trim()) {
      vazias++;
      return;
    }
    if (tipo === "contrato_locacao") {
      paginasContrato.push(conteudo);
      return;
    }
    if (tipo === "fatura") {
      const registro = lerFatura(conteudo, raizDoCliente, nomes);
      if (registro) saida.push(linha(numero, 1, registro));
      return;
    }
    if (tipo === "rpa") {
      lerPaginaRpa(conteudo).forEach((r, k) => saida.push(linha(numero, k + 1, r)));
      return;
    }
    if (tipo === "contrato_motorista") {
      const registro = lerContratoMotorista(conteudo, raizDoCliente);
      if (registro) saida.push(linha(numero, 1, registro));
      return;
    }

    // RECIBO: TRÊS TENTATIVAS, do mais específico ao mais tolerante. O RPA vem
    // antes de tudo porque há RPA guardado como recibo, e lê-lo como recibo
    // perderia as retenções e o segundo bloco da página.
    const rpas = lerPaginaRpa(conteudo);
    if (rpas.length) {
      rpas.forEach((r, k) => {
        const registro = { ...r };
        if (registro.situacao === "ok") {
          registro.situacao = "conferir";
          registro.observacao = "layout de RPA achado em pasta de recibo — confira se o tipo está certo antes de contar";
        }
        saida.push(linha(numero, k + 1, registro));
      });
      return;
    }
    // CONTRATO DE LOCAÇÃO FORA DO LUGAR. Antes dos leitores de recibo porque
    // eles ADIVINHAM: lido por eles, o contrato viraria um pagamento comum e
    // passaria pelas travas que olham o tipo. Entra 'conferir', não como
    // contrato -- quem decide o tipo é gente.
    if (pareceContratoLocacao(conteudo)) {
      const contrato = lerContratoLocacao(conteudo, raizDoCliente, valorDoNomeArquivo(arquivo));
      if (contrato) {
        const anterior = (contrato.observacao || "").trim();
        saida.push(
          linha(numero, 1, {
            ...contrato,
            situacao: "conferir",
            observacao:
              `layout de CONTRATO DE LOCAÇÃO achado em pasta de ${tipo} — contrato é cadastro, não pagamento: ` +
              `confira o tipo do documento antes de contar` +
              (anterior ? ` | ${anterior}` : ""),
          }),
        );
        return;
      }
    }
    const registro =
      lerReciboMotorista(conteudo, raizDoCliente, nomes) ?? lerReciboGenerico(conteudo, raizDoCliente, nomes);
    if (registro) saida.push(linha(numero, 1, registro));
  });

  if (tipo === "contrato_locacao") {
    const registro = lerContratoLocacao(paginasContrato.join("\n"), raizDoCliente, valorDoNomeArquivo(arquivo));
    // UMA LINHA POR CONTRATO, página 1: o acordo é um só.
    if (registro) saida.push(linha(1, 1, registro));
  }

  if (saida.length === 0) {
    // "É imagem" e "é outro documento" pedem ações diferentes: preencher à mão
    // numa, reclassificar na outra.
    const total = paginas.length;
    const motivo =
      vazias === total
        ? `nenhuma das ${total} páginas tem texto (PDF de imagem — preencha os valores à mão)`
        : `texto lido, mas nenhuma página bate no layout de ${tipo}`;
    return [linha(0, 1, { ...VAZIO, situacao: "invalido", observacao: motivo })];
  }
  return saida;
}
