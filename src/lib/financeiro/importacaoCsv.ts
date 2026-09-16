// Importação de lançamentos por CSV. Função pura: lê, valida e marca
// duplicidade; quem grava é a action.
//
// ─── Duas passadas, e a segunda relê o arquivo ──────────────────────────────
//
// A tela mostra a prévia e só grava na confirmação. A confirmação **não
// confia na prévia que o navegador guardou**: manda o texto de novo e passa
// por esta mesma função. Linha que o navegador marcou como válida e o
// servidor não acha válida não entra.

import { parseCsv, normalizeHeader } from "@/lib/csv";
import { chaveDaCategoria } from "@/lib/dre/calculo";
import {
  validarCamposDoLancamento,
  digitosDoDocumento,
  type LancamentoValidado,
} from "./manual";
import { competenciaDe } from "./periodo";
import { casarCentroDeCusto, type CentroParaCasar } from "./centroDeCusto";

/** Linhas por arquivo. Mais que isso é migração, e migração pede conferência por lote. */
export const MAXIMO_DE_LINHAS = 2000;

type Coluna =
  | "tipo"
  | "contraparte"
  | "documento"
  | "categoria"
  | "competencia"
  | "vencimento"
  | "valor"
  | "descricao"
  | "pagoEm"
  | "centroDeCusto";

// Os apelidos saem do que as planilhas do BPO e os exports de ERP costumam
// chamar cada coisa. Comparados já normalizados — sem acento, caixa ou espaço.
const APELIDOS: Record<Coluna, string[]> = {
  tipo: ["tipo", "natureza", "operacao"],
  contraparte: ["contraparte", "fornecedor", "cliente", "sacado", "fornecedorcliente", "nome", "favorecido"],
  documento: ["documento", "cnpj", "cpf", "cnpjcpf", "cpfcnpj"],
  categoria: ["categoria", "conta", "planodecontas"],
  competencia: ["competencia", "mesdecompetencia"],
  vencimento: ["vencimento", "datadevencimento", "datavencimento"],
  valor: ["valor", "valorr", "valortotal"],
  descricao: ["descricao", "historico", "observacao"],
  pagoEm: ["pagoem", "datadepagamento", "datapagamento", "recebidoem", "baixa", "databaixa"],
  // Opcional. Casa pelo nome ou pelo código do centro — ver `casarCentroDeCusto`.
  centroDeCusto: ["centrodecusto", "centrocusto", "centro", "codigodocentro"],
};

const OBRIGATORIAS: Coluna[] = ["tipo", "contraparte", "vencimento", "valor"];

export type CategoriaParaCasar = { id: string; nome: string; kind: "PAGAR" | "RECEBER" };

export type DadosDaLinha = LancamentoValidado & {
  contraparteNome: string;
  contraparteDocumento: string | null;
  /**
   * Centro escrito na coluna e casado com um centro ativo. `null` quando a
   * coluna está vazia ou ausente — aí a gravação herda o padrão da contraparte.
   */
  centroDeCustoId: string | null;
};

export type LinhaDaImportacao =
  | { numero: number; situacao: "valida"; dados: DadosDaLinha }
  | { numero: number; situacao: "duplicada"; dados: DadosDaLinha; erro: string }
  | { numero: number; situacao: "erro"; erro: string };

export type PreviaDaImportacao =
  | { ok: false; erro: string }
  | { ok: true; linhas: LinhaDaImportacao[] };

/**
 * A chave que diz "este lançamento já existe".
 *
 * Tipo, contraparte, competência, vencimento e valor. Documento quando há,
 * nome normalizado quando não. Não entra descrição: a mesma conta relançada
 * com outro histórico continua sendo a mesma conta — e duplicar é pagar duas
 * vezes.
 */
export function chaveDeDuplicidade(l: {
  kind: string;
  contraparteDocumento: string | null;
  contraparteNome: string;
  competencia: string;
  vencimentoKey: string;
  centavos: number;
}): string {
  const quem = l.contraparteDocumento ?? `nome:${chaveDaCategoria(l.contraparteNome)}`;
  return [l.kind, quem, l.competencia, l.vencimentoKey, l.centavos].join("|");
}

/** Tipo escrito do jeito que as pessoas escrevem. */
export function tipoDeTexto(texto: string): "PAGAR" | "RECEBER" | null {
  const t = normalizeHeader(texto);
  if (["pagar", "p", "despesa", "saida", "debito", "apagar"].includes(t)) return "PAGAR";
  if (["receber", "r", "receita", "entrada", "credito", "areceber"].includes(t)) return "RECEBER";
  return null;
}

/** `dd/mm/aaaa` ou `aaaa-mm-dd` para `aaaa-mm-dd`. Vazio fica vazio. */
export function dataDeTexto(texto: string): string {
  const t = texto.trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (br) return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
  return t;
}

/** `mm/aaaa` ou `aaaa-mm`. Vazio fica vazio. */
export function competenciaDeTexto(texto: string): string {
  const t = texto.trim();
  const br = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (br) return competenciaDe(Number(br[2]), Number(br[1]));
  return t;
}

/**
 * Lê o CSV e devolve cada linha com a situação dela.
 *
 * - categoria casa pelo nome normalizado **e pelo tipo** — "Aluguel" de
 *   receita e "Aluguel" de despesa são categorias diferentes no plano;
 * - competência em branco herda o mês do vencimento, que é o que quase toda
 *   planilha de contas quer dizer quando não diz;
 * - duplicada é a linha cuja chave já existe no banco **ou mais acima no
 *   próprio arquivo**. Ela aparece na prévia, mas não é gravada. O centro de
 *   custo não entra na chave: a mesma conta com outro centro é a mesma conta;
 * - centro de custo (coluna opcional) casa com os centros **ativos** recebidos,
 *   por nome ou código; escrito e não encontrado é erro da linha.
 */
export function prepararImportacao(
  texto: string,
  hojeKey: string,
  categorias: CategoriaParaCasar[],
  chavesExistentes: Set<string>,
  centros: CentroParaCasar[] = []
): PreviaDaImportacao {
  const { headers, rows } = parseCsv(texto);
  if (headers.length === 0) return { ok: false, erro: "O arquivo está vazio." };

  const indice = new Map<Coluna, number>();
  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    for (const [coluna, apelidos] of Object.entries(APELIDOS) as [Coluna, string[]][]) {
      if (!indice.has(coluna) && apelidos.includes(n)) indice.set(coluna, i);
    }
  });

  const faltando = OBRIGATORIAS.filter((c) => !indice.has(c));
  if (faltando.length > 0) {
    return {
      ok: false,
      erro: `Faltam colunas obrigatórias: ${faltando.join(", ")}. Veja o modelo de cabeçalho na tela.`,
    };
  }
  if (rows.length === 0) return { ok: false, erro: "O arquivo só tem o cabeçalho." };
  if (rows.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo tem ${rows.length} linhas; o limite é ${MAXIMO_DE_LINHAS} por importação.` };
  }

  const porNome = new Map(categorias.map((c) => [`${c.kind}|${chaveDaCategoria(c.nome)}`, c.id]));
  const vistas = new Set(chavesExistentes);

  const linhas: LinhaDaImportacao[] = rows.map((row, i) => {
    // +2: a planilha começa em 1 e a primeira linha é o cabeçalho. É o número
    // que a pessoa vai procurar no Excel.
    const numero = i + 2;
    const campo = (c: Coluna) => {
      const idx = indice.get(c);
      return idx === undefined ? "" : (row[idx] ?? "").trim();
    };

    const kind = tipoDeTexto(campo("tipo"));
    if (!kind) return { numero, situacao: "erro", erro: `Tipo "${campo("tipo")}" não é pagar nem receber.` };

    const contraparteNome = campo("contraparte");
    if (!contraparteNome) return { numero, situacao: "erro", erro: "Sem fornecedor ou cliente." };
    if (contraparteNome.length > 180) return { numero, situacao: "erro", erro: "Nome da contraparte com mais de 180 caracteres." };

    const contraparteDocumento = digitosDoDocumento(campo("documento"));
    if (contraparteDocumento && contraparteDocumento.length !== 11 && contraparteDocumento.length !== 14) {
      return { numero, situacao: "erro", erro: "Documento não é CPF (11 dígitos) nem CNPJ (14)." };
    }

    const nomeDaCategoria = campo("categoria");
    const categoryId = nomeDaCategoria ? porNome.get(`${kind}|${chaveDaCategoria(nomeDaCategoria)}`) ?? null : null;
    // Categoria escrita e não encontrada é erro mesmo em RECEBER: a pessoa quis
    // classificar, e lançar sem categoria desfaria a intenção sem avisar.
    if (nomeDaCategoria && !categoryId) {
      return { numero, situacao: "erro", erro: `Categoria "${nomeDaCategoria}" não existe no plano de contas para ${kind === "PAGAR" ? "pagar" : "receber"}.` };
    }

    const centro = casarCentroDeCusto(campo("centroDeCusto"), centros);
    if (!centro.ok) return { numero, situacao: "erro", erro: centro.erro };

    const vencimento = dataDeTexto(campo("vencimento"));
    const competencia = competenciaDeTexto(campo("competencia")) || vencimento.slice(0, 7);

    const v = validarCamposDoLancamento(
      {
        kind,
        competencia,
        vencimento,
        valor: campo("valor"),
        descricao: campo("descricao"),
        pagoEm: dataDeTexto(campo("pagoEm")),
        categoryId,
      },
      hojeKey
    );
    if (!v.ok) return { numero, situacao: "erro", erro: v.erro };

    const dados: DadosDaLinha = { ...v.dados, contraparteNome, contraparteDocumento, centroDeCustoId: centro.centroId };
    const chave = chaveDeDuplicidade(dados);
    if (vistas.has(chave)) {
      return { numero, situacao: "duplicada", dados, erro: "Já existe lançamento igual (tipo, contraparte, competência, vencimento e valor)." };
    }
    vistas.add(chave);
    return { numero, situacao: "valida", dados };
  });

  return { ok: true, linhas };
}
