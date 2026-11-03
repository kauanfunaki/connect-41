// Pagamentos sem nota fiscal (03/11/2026): o passo 5 do painel contábil do
// SPED Generator, portado de `contabil_apoio.py`. RPA, recibos, contratos de
// motorista e faturas de aluguel viram lançamentos da Domínio; o que falta
// cadastrar vira pendência. Puro: quem lê o banco é `pagamentosServidor.ts`.
//
// A mesma regra de ouro do de-para das notas: conta contábil não se adivinha.
//   DÉBITO   sai do lançamento-modelo da categoria (motorista, aluguel de
//            veículo, aluguel de imóvel, RPA) ou da regra da categoria;
//   CRÉDITO  sai do fornecedor — a regra pelo CPF/CNPJ, a conta confirmada
//            para o nome, a conta única de nome igual no plano — ou do padrão
//            da categoria. Sem nenhum, pendência com o motivo escrito.
//
// O que mudou na vinda:
// - as contas dos lançamentos-modelo eram da BLD e estavam no código; aqui
//   são da empresa (`ContasDosPagamentos`), já preenchidas com as do motor;
// - as contas são o código reduzido da Domínio, como no resto do Connect (o
//   motor guardava a classificação e traduzia na hora da planilha);
// - dinheiro em centavos inteiros;
// - o recibo diz se é de motorista pela escolha feita no envio, não pela pasta
//   da rede (o Connect não tem a pasta); o recibo sem escolha segue a pasta.

import { chaveDoNome, type ContaDoPlano } from "./lancamentos";
import { LIMITE_DA_SEMELHANCA, semelhanca } from "./sugestao";

export const TIPOS_DE_PAGAMENTO = ["rpa", "recibo", "contrato_motorista", "contrato_locacao", "fatura"] as const;
export type TipoDePagamento = (typeof TIPOS_DE_PAGAMENTO)[number];

/** As categorias que o contábil nomeou (25/08/2026). O código de débito de cada uma é cadastro da empresa. */
export const CATEGORIAS = [
  ["contrato_motorista", "Contratos Motoristas"],
  ["contrato_locacao_veiculo", "Contratos Locação Veículo"],
  ["contrato_locacao_imovel", "Contratos Locação Imóveis"],
  ["rpa", "RPA"],
  ["fatura_aluguel_imovel", "Fatura Aluguel Imóvel"],
  ["fatura_aluguel_veiculo", "Fatura Aluguel Veículos"],
  ["fatura_aluguel_maquina", "Fatura Aluguel Máquinas"],
  ["recibo_motorista", "Recibo de motorista"],
  ["recibo_outros", "Recibo (outras despesas)"],
] as const;
export type Categoria = (typeof CATEGORIAS)[number][0];
const ROTULO = new Map<string, string>(CATEGORIAS);
export const rotuloDaCategoria = (categoria: string) => ROTULO.get(categoria) ?? (categoria || "(sem categoria)");

/** O que o documento é, para a coluna "Tipo" (20/10/2026): a primeira coisa que o contábil precisa saber para escolher a conta. */
const TIPO_POR_CATEGORIA: Record<string, [string, string]> = {
  contrato_motorista: ["Motorista", "contrato de motorista autônomo"],
  recibo_motorista: ["Motorista", "recibo"],
  rpa: ["Autônomo", "RPA"],
  contrato_locacao_veiculo: ["Veículo", "contrato de locação"],
  fatura_aluguel_veiculo: ["Veículo", "fatura de aluguel"],
  contrato_locacao_imovel: ["Imóvel", "contrato de locação"],
  fatura_aluguel_imovel: ["Imóvel", "fatura de aluguel"],
  fatura_aluguel_maquina: ["Máquina", "fatura de aluguel"],
  recibo_outros: ["Outras despesas", "recibo"],
};

/** Categoria fora do catálogo mostra o próprio rótulo, sem documento: inventar um assunto seria palpite. */
export function tipoDaCategoria(categoria: string): { assunto: string; documento: string } {
  const [assunto, documento] = TIPO_POR_CATEGORIA[categoria] ?? [rotuloDaCategoria(categoria), ""];
  return { assunto, documento };
}

/** Uma retenção do RPA, como o leitor a acha no documento. */
export type Retencao = { verba: string; descricao: string; centavos: number };

/**
 * Um pagamento lido de um documento, já com o que a conferência corrigiu por
 * cima (ver `pagamentoEfetivo`). `tipoCorrigido` e `categoriaCorrigida` não
 * são trocados antes: `categoriaDoPagamento` lê os dois e decide.
 */
export type Pagamento = {
  id?: string;
  tipo: string;
  tipoCorrigido?: string;
  /** A categoria que o leitor (ou a escolha do envio) gravou. Vazia = derive do tipo. */
  categoria: string;
  categoriaCorrigida?: string;
  nome: string;
  /** CPF ou CNPJ, só dígitos. */
  documento: string;
  numero: string;
  /** "AAAA-MM-DD" ou vazio. */
  dataPagamento: string;
  /** "AAAA-MM" ou vazio. */
  competencia: string;
  brutoCentavos: number | null;
  liquidoCentavos: number | null;
  retencoes: Retencao[] | null;
  /** O nome do arquivo e a pasta informada no envio — a pista do recibo de motorista. */
  arquivo: string;
  pasta?: string;
  /** A página dentro do PDF; zero na fatura, que nasce de uma linha da planilha do BPO. */
  pagina: number;
  /** Onde o documento abre: o PDF guardado no Connect. */
  arquivoId?: string | null;
};

// ---- a categoria ----------------------------------------------------------

const PASTA_MOTORISTA = /MOTORISTA/i;

/**
 * A categoria contábil de um pagamento. A corrigida por uma pessoa ganha de
 * tudo; o tipo corrigido arrasta a categoria junto, e por isso a gravada (do
 * leitor do tipo antigo) é descartada quando o tipo mudou.
 */
export function categoriaDoPagamento(p: Pick<Pagamento, "tipo" | "tipoCorrigido" | "categoria" | "categoriaCorrigida" | "arquivo" | "pasta">): string {
  const corrigida = (p.categoriaCorrigida ?? "").trim();
  if (corrigida) return corrigida;
  const tipoCorrigido = (p.tipoCorrigido ?? "").trim();
  const tipo = tipoCorrigido || p.tipo || "";
  const gravada = tipoCorrigido && tipoCorrigido !== p.tipo ? "" : (p.categoria ?? "");
  if (tipo === "rpa" || tipo === "contrato_motorista") return tipo;
  // A base do motor só tinha contratos de imóvel; o de veículo vem gravado pela leitura do texto.
  if (tipo === "contrato_locacao") return gravada || "contrato_locacao_imovel";
  if (tipo === "recibo") {
    if (gravada === "recibo_motorista" || gravada === "recibo_outros") return gravada;
    return PASTA_MOTORISTA.test(`${p.pasta ?? ""} ${p.arquivo ?? ""}`) ? "recibo_motorista" : "recibo_outros";
  }
  // Veículo é o desempate: as faturas do BPO são de locação de frota. Máquina vem gravada pelo texto.
  if (tipo === "fatura") return gravada || "fatura_aluguel_veiculo";
  return tipo || "desconhecida";
}

// ---- o plano de fornecedores -----------------------------------------------

export type ContaResumida = { reduzido: string; classificacao: string; nome: string; semelhanca?: number };

/**
 * As contas de fornecedor do plano, indexadas para casar pelo nome. A
 * sugestão compara só com quem começa pela mesma palavra, como no motor.
 */
export class PlanoDeFornecedores {
  private readonly porNome = new Map<string, ContaDoPlano[]>();
  private readonly porInicio = new Map<string, [string, ContaDoPlano][]>();
  private readonly porConta = new Map<string, string>();

  constructor(contas: readonly ContaDoPlano[] = []) {
    for (const c of contas) {
      for (const codigo of [c.classificacao, c.reduzido]) if ((codigo ?? "").trim()) this.porConta.set(codigo.trim(), c.nome);
      const chave = chaveDoNome(c.nome);
      if (!chave) continue;
      this.porNome.set(chave, [...(this.porNome.get(chave) ?? []), c]);
      const inicio = chave.split(" ")[0];
      this.porInicio.set(inicio, [...(this.porInicio.get(inicio) ?? []), [chave, c]]);
    }
  }

  nomeDaConta(conta: string): string {
    return this.porConta.get((conta ?? "").trim()) ?? "";
  }

  homonimos(chave: string): ContaDoPlano[] {
    return this.porNome.get(chave) ?? [];
  }

  unica(chave: string): ContaDoPlano | null {
    const contas = this.homonimos(chave);
    return contas.length === 1 ? contas[0] : null;
  }

  sugerir(chave: string): ContaResumida | null {
    if (chave.length < 6) return null;
    let melhor: ContaDoPlano | null = null;
    let nota = 0;
    for (const [outra, conta] of this.porInicio.get(chave.split(" ")[0]) ?? []) {
      const r = semelhanca(chave, outra);
      if (r > nota) [melhor, nota] = [conta, r];
    }
    return melhor && nota >= LIMITE_DA_SEMELHANCA ? resumo(melhor, nota) : null;
  }
}

function resumo(c: ContaDoPlano, nota?: number): ContaResumida {
  return { reduzido: c.reduzido, classificacao: c.classificacao, nome: c.nome, ...(nota === undefined ? {} : { semelhanca: Math.round(nota * 1000) / 1000 }) };
}

// ---- os lançamentos-modelo do contábil (07/10/2026) --------------------------

/**
 * As contas dos lançamentos-modelo, por empresa. Vencem a regra da categoria:
 * são a definição do contábil de como o lançamento é. O crédito vazio do
 * veículo e do imóvel é a conta do fornecedor (o locador).
 */
export type ContasDosPagamentos = {
  motoristaDebito: string; motoristaCredito: string; motoristaHistorico: string;
  veiculoDebito: string; veiculoHistorico: string;
  imovelDebito: string; imovelHistorico: string;
  rpaDebito: string;
  rpaIss: string; rpaIssHistorico: string;
  rpaInss: string; rpaInssHistorico: string;
  rpaSest: string; rpaSestHistorico: string;
  rpaLiquido: string; rpaLiquidoHistorico: string;
};

/** Os códigos da BLD que o motor usava (prints da Sidineia, 07/10/2026). Valem até a empresa gravar outros. */
export const CONTAS_DO_MOTOR: ContasDosPagamentos = {
  motoristaDebito: "7535", motoristaCredito: "7251", motoristaHistorico: "133",
  veiculoDebito: "1153", veiculoHistorico: "134",
  imovelDebito: "341", imovelHistorico: "135",
  rpaDebito: "4192",
  rpaIss: "580", rpaIssHistorico: "66",
  rpaInss: "191", rpaInssHistorico: "21",
  rpaSest: "578", rpaSestHistorico: "33",
  rpaLiquido: "525", rpaLiquidoHistorico: "20",
};

type Modelo = { debito: string; codigoHistorico: string; complemento: string; creditoFixo: string; nomeDoCredor: boolean };

function modelos(c: ContasDosPagamentos): Record<string, Modelo> {
  // Todos os motoristas na conta coletiva, com contrato ou sem; sem número vai "000".
  const motorista: Modelo = { debito: c.motoristaDebito, creditoFixo: c.motoristaCredito, codigoHistorico: c.motoristaHistorico, complemento: "{numero} {nome}", nomeDoCredor: false };
  return {
    contrato_motorista: motorista,
    recibo_motorista: motorista,
    // O nome no histórico é o da CONTA de crédito: a locadora e o locador, não a imobiliária.
    fatura_aluguel_veiculo: { debito: c.veiculoDebito, creditoFixo: "", codigoHistorico: c.veiculoHistorico, complemento: "{numero} {nome}", nomeDoCredor: true },
    fatura_aluguel_imovel: { debito: c.imovelDebito, creditoFixo: "", codigoHistorico: c.imovelHistorico, complemento: "- {nome}", nomeDoCredor: true },
  };
}
export const SEM_NUMERO = "000";
export const CATEGORIAS_COM_MODELO = ["contrato_motorista", "recibo_motorista", "fatura_aluguel_veiculo", "fatura_aluguel_imovel", "rpa"] as const;

/** Fora dos modelos, o texto combinado com o contábil, sem código de histórico. */
const HISTORICO_SEM_CODIGO: Record<string, string> = { recibo_outros: "RECIBO {nome}" };

/**
 * O RPA não é um lançamento por documento: é a folha dos autônomos, uma por
 * mês, no último dia — D bruto contra cada crédito, em lançamentos simples.
 */
type Parcela = "iss" | "inss" | "sest_senat" | "liquido";
function creditosDoRpa(c: ContasDosPagamentos): [Parcela, string, string][] {
  return [["iss", c.rpaIss, c.rpaIssHistorico], ["inss", c.rpaInss, c.rpaInssHistorico], ["sest_senat", c.rpaSest, c.rpaSestHistorico], ["liquido", c.rpaLiquido, c.rpaLiquidoHistorico]];
}
/** Verba da folha → parcela. Medido nos 5.103 RPA do motor: só estas cinco aparecem. */
export const VERBAS_DO_RPA: Record<string, Exclude<Parcela, "liquido">> = { "9135": "iss", "9105": "inss", "9401": "sest_senat", "9402": "sest_senat", "9403": "sest_senat" };

const verbasDesconhecidas = (p: Pagamento) => (p.retencoes ?? []).filter((r) => !(String(r.verba ?? "") in VERBAS_DO_RPA));

const AAAA_MM = /^\d{4}-(0[1-9]|1[0-2])$/;
function competenciaDoRpa(p: Pagamento): string {
  return [p.competencia.slice(0, 7), p.dataPagamento.slice(0, 7)].find((c) => AAAA_MM.test(c)) ?? "";
}
function ultimoDia(competencia: string): string {
  const [ano, mes] = [Number(competencia.slice(0, 4)), Number(competencia.slice(5, 7))];
  return `${competencia}-${String(new Date(Date.UTC(ano, mes, 0)).getUTCDate()).padStart(2, "0")}`;
}
/** A data do pagamento; sem ela, o último dia da competência — a Domínio não importa lançamento sem data. */
function dataDoLancamento(p: Pagamento): string {
  const data = p.dataPagamento.trim();
  if (data) return data;
  const competencia = p.competencia.slice(0, 7);
  return AAAA_MM.test(competencia) ? ultimoDia(competencia) : "";
}

// ---- o relatório -------------------------------------------------------------

export const ORIGEM = {
  cnpj: "regra do fornecedor (CPF/CNPJ)",
  nomeConfirmado: "conta confirmada para o nome",
  plano: "nome igual no plano de contas",
  categoria: "conta padrão da categoria",
  modelo: "lançamento-modelo do contábil",
} as const;
export type OrigemDoPagamento = (typeof ORIGEM)[keyof typeof ORIGEM];

export type LancamentoDoPagamento = {
  debito: string;
  credito: string;
  centavos: number;
  data: string;
  historico: string;
  codigoHistorico: string;
  origemDoCredito: OrigemDoPagamento;
  // ---- o rastro: de onde veio, sem voltar ao PDF ----
  categoria: string;
  tipoDocumento: string;
  fonte: string;
  pagina: number;
  arquivoId: string | null;
  cpfCnpj: string;
  nome: string;
  competencia: string;
  pagamentoId: string | null;
};

export type FaltaDoPagamento = "codigo_debito" | "conta_credito" | "retencao" | "competencia";

/** Um cadastro que falta, agregado: é o que o contábil recebe para preencher. */
export type PendenciaDoPagamento = {
  falta: FaltaDoPagamento;
  /** A categoria, o CPF/CNPJ (ou o nome, sem documento) ou a verba. */
  chave: string;
  rotulo: string;
  categoria: string;
  tipoDocumento: string;
  /** Todas as categorias dos pagamentos agregados, na ordem em que apareceram. */
  categorias: string[];
  documentos: number;
  centavos: number;
  /** Até três exemplos diferentes, com onde abrir cada um. */
  exemplos: { fonte: string; arquivoId: string | null; pagina: number; pagamentoId: string | null }[];
  motivo: string;
  temDocumento: boolean;
  sugestao: ContaResumida | null;
  homonimos: ContaResumida[];
};

export type RelatorioDosPagamentos = {
  lancamentos: LancamentoDoPagamento[];
  pendencias: PendenciaDoPagamento[];
  centavosLancados: number;
  centavosPendentes: number;
  documentosLancados: number;
  documentosPendentes: number;
};

/** A regra de uma categoria: o débito e o crédito padrão (o `depara_documento_conta`). */
export type RegraDaCategoria = { codigoDebito: string; contaCredito: string };

export type EntradasDoRelatorio = {
  /** A regra de cada categoria. */
  categorias?: Readonly<Record<string, RegraDaCategoria>>;
  /** CPF/CNPJ → conta de crédito, da regra do fornecedor no de-para das notas. */
  contasDoFornecedor?: ReadonlyMap<string, string>;
  /** chave do nome → conta, o que uma pessoa confirmou para pagamento sem CPF/CNPJ. */
  contasPorNome?: ReadonlyMap<string, string>;
  plano?: PlanoDeFornecedores;
  contas?: ContasDosPagamentos;
  /** O líquido no lugar do bruto (decisão fiscal em aberto no RPA; o relatório não escolhe). */
  usarLiquido?: boolean;
};

function fonte(p: Pagamento): string {
  if (p.tipo === "fatura") return `planilha do BPO · nota ${p.numero || "(sem número)"}`;
  return p.pagina ? `${p.arquivo} p.${p.pagina}` : p.arquivo;
}

function historicoGenerico(p: Pagamento, categoria: string): string {
  const partes = [rotuloDaCategoria(categoria)];
  if (p.numero) partes.push(`recibo ${p.numero}`);
  if (p.nome) partes.push(p.nome);
  return partes.join(" - ").slice(0, 200);
}

/** Lançamentos e pendências dos pagamentos sem nota. O crédito segue a ordem do motor: CPF/CNPJ, nome confirmado, plano, categoria. */
export function montarPagamentos(pagamentos: readonly Pagamento[], e: EntradasDoRelatorio = {}): RelatorioDosPagamentos {
  const categorias = e.categorias ?? {};
  const contasDoFornecedor = e.contasDoFornecedor ?? new Map<string, string>();
  const contasPorNome = e.contasPorNome ?? new Map<string, string>();
  const plano = e.plano ?? new PlanoDeFornecedores();
  const contas = e.contas ?? CONTAS_DO_MOTOR;
  const deModelo = modelos(contas);
  const relatorio: RelatorioDosPagamentos = { lancamentos: [], pendencias: [], centavosLancados: 0, centavosPendentes: 0, documentosLancados: 0, documentosPendentes: 0 };
  const pendentes = new Map<string, PendenciaDoPagamento>();
  const rpaDoMes = new Map<string, { bruto: number; iss: number; inss: number; sest_senat: number; qtd: number }>();

  const pendente = (falta: FaltaDoPagamento, chave: string, rotulo: string, p: Pagamento, categoria: string, documento: string, centavos: number) => {
    const k = `${falta}|${chave}`;
    let alvo = pendentes.get(k);
    if (!alvo) {
      alvo = { falta, chave, rotulo, categoria, tipoDocumento: p.tipo, categorias: [], documentos: 0, centavos: 0, exemplos: [], motivo: "", temDocumento: !!documento, sugestao: null, homonimos: [] };
      pendentes.set(k, alvo);
    }
    if (!alvo.categorias.includes(categoria)) alvo.categorias.push(categoria);
    alvo.documentos += 1;
    alvo.centavos += centavos;
    // Sem repetição: três exemplos idênticos não informam nada.
    const f = fonte(p);
    if (alvo.exemplos.length < 3 && !alvo.exemplos.some((x) => x.fonte === f)) alvo.exemplos.push({ fonte: f, arquivoId: p.arquivoId ?? null, pagina: p.pagina, pagamentoId: p.id ?? null });
  };

  for (const p of pagamentos) {
    const categoria = categoriaDoPagamento(p);
    const regra = categorias[categoria];
    const modelo = deModelo[categoria];
    const documento = p.documento.trim();

    if (categoria === "rpa") {
      // Vai para a folha do mês. Retenção de verba desconhecida não entra pela metade: o RPA inteiro fica fora.
      const desconhecidas = verbasDesconhecidas(p);
      const bruto = p.brutoCentavos ?? 0;
      const competencia = competenciaDoRpa(p);
      if (desconhecidas.length || !competencia) {
        if (desconhecidas.length) pendente("retencao", `verba ${desconhecidas[0].verba || "?"}`, desconhecidas[0].descricao || "(sem descrição)", p, categoria, documento, bruto);
        else pendente("competencia", "(RPA sem competência)", p.nome.trim() || "(sem nome)", p, categoria, documento, bruto);
        relatorio.centavosPendentes += bruto;
        relatorio.documentosPendentes += 1;
        continue;
      }
      const mes = rpaDoMes.get(competencia) ?? { bruto: 0, iss: 0, inss: 0, sest_senat: 0, qtd: 0 };
      mes.bruto += bruto;
      mes.qtd += 1;
      for (const r of p.retencoes ?? []) mes[VERBAS_DO_RPA[String(r.verba)]] += r.centavos;
      rpaDoMes.set(competencia, mes);
      continue;
    }

    const centavos = (e.usarLiquido ? p.liquidoCentavos : p.brutoCentavos) ?? 0;
    const debito = (modelo ? modelo.debito : regra?.codigoDebito ?? "").trim();
    let credito = "";
    let origem: OrigemDoPagamento = ORIGEM.categoria;
    if (modelo?.creditoFixo) [credito, origem] = [modelo.creditoFixo, ORIGEM.modelo];
    else if (documento) [credito, origem] = [contasDoFornecedor.get(documento) ?? "", ORIGEM.cnpj];
    else {
      const chave = chaveDoNome(p.nome);
      const unica = chave ? plano.unica(chave) : null;
      if (chave && contasPorNome.get(chave)) [credito, origem] = [contasPorNome.get(chave)!, ORIGEM.nomeConfirmado];
      else if (unica) [credito, origem] = [unica.reduzido, ORIGEM.plano];
    }
    if (!credito && regra?.contaCredito) [credito, origem] = [regra.contaCredito, ORIGEM.categoria];
    credito = credito.trim();

    const faltas: [FaltaDoPagamento, string, string][] = [];
    if (!debito) faltas.push(["codigo_debito", categoria, rotuloDaCategoria(categoria)]);
    // A pendência de crédito é por pessoa, e sem documento a pessoa é o nome:
    // juntar todos os sem-CPF numa chave só pediria a conta de "(sem documento)".
    if (!credito) faltas.push(["conta_credito", documento || p.nome.trim() || "(sem identificação)", p.nome.trim() || "(sem nome)"]);
    if (faltas.length) {
      relatorio.centavosPendentes += centavos;
      relatorio.documentosPendentes += 1;
      for (const [falta, chave, rotulo] of faltas) pendente(falta, chave, rotulo, p, categoria, documento, centavos);
      continue;
    }

    let historico: string, codigoHistorico: string;
    if (modelo) {
      // Sem nome no documento, vai o CPF/CNPJ: "000 " sozinho não diz a quem.
      const nome = (modelo.nomeDoCredor ? plano.nomeDaConta(credito) : "") || p.nome.trim() || documento;
      historico = modelo.complemento.replace("{numero}", p.numero.trim() || SEM_NUMERO).replace("{nome}", nome.trim().toUpperCase()).slice(0, 200);
      codigoHistorico = modelo.codigoHistorico;
    } else {
      // Sem código de histórico fora dos modelos: conta na coluna de histórico é histórico inexistente.
      const texto = HISTORICO_SEM_CODIGO[categoria];
      const nome = p.nome.trim() || documento;
      historico = texto ? texto.replace("{nome}", nome.toUpperCase()).slice(0, 200) : historicoGenerico(p, categoria);
      codigoHistorico = "";
    }
    relatorio.centavosLancados += centavos;
    relatorio.documentosLancados += 1;
    relatorio.lancamentos.push({
      debito, credito, centavos, data: dataDoLancamento(p), historico, codigoHistorico, origemDoCredito: origem,
      categoria, tipoDocumento: p.tipo, fonte: fonte(p), pagina: p.tipo === "fatura" ? 0 : p.pagina, arquivoId: p.arquivoId ?? null,
      cpfCnpj: documento, nome: p.nome, competencia: p.competencia, pagamentoId: p.id ?? null,
    });
  }

  for (const competencia of [...rpaDoMes.keys()].sort()) lancarRpa(relatorio, competencia, rpaDoMes.get(competencia)!, contas);

  // Maior valor primeiro: é a ordem em que compensa cadastrar.
  relatorio.pendencias = [...pendentes.values()].sort((a, b) => b.centavos - a.centavos);
  for (const p of relatorio.pendencias) explicar(p, plano);
  return relatorio;
}

/** A folha dos autônomos de um mês. O líquido é o bruto menos as retenções, para o débito fechar com os créditos sempre. */
function lancarRpa(relatorio: RelatorioDosPagamentos, competencia: string, mes: { bruto: number; iss: number; inss: number; sest_senat: number; qtd: number }, contas: ContasDosPagamentos) {
  const partes: Record<Parcela, number> = { iss: mes.iss, inss: mes.inss, sest_senat: mes.sest_senat, liquido: mes.bruto - mes.iss - mes.inss - mes.sest_senat };
  const data = ultimoDia(competencia);
  const mmAaaa = `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
  for (const [parcela, conta, codigo] of creditosDoRpa(contas)) {
    if (!partes[parcela]) continue;
    relatorio.lancamentos.push({
      debito: contas.rpaDebito, credito: conta, centavos: partes[parcela], data, historico: mmAaaa, codigoHistorico: codigo, origemDoCredito: ORIGEM.modelo,
      categoria: "rpa", tipoDocumento: "rpa", fonte: `${mes.qtd} RPA de ${mmAaaa}`, pagina: 0, arquivoId: null,
      cpfCnpj: "", nome: parcela.replace("_", "/").toUpperCase(), competencia, pagamentoId: null,
    });
  }
  relatorio.centavosLancados += mes.bruto;
  relatorio.documentosLancados += mes.qtd;
}

/** Escreve na pendência por que ela não virou lançamento e o que resolve: cada texto diz o que fazer, não só o que falta. */
function explicar(p: PendenciaDoPagamento, plano: PlanoDeFornecedores) {
  if (p.falta === "retencao") {
    p.motivo = `RPA com uma retenção que o lançamento-modelo do contábil não prevê (${p.chave}: ${p.rotulo}). O RPA fica fora da folha do mês até se saber em que conta essa retenção é creditada.`;
    return;
  }
  if (p.falta === "competencia") {
    p.motivo = "RPA sem competência: não há como saber em que mês da folha ele entra. Corrija a competência em Documentos lidos.";
    return;
  }
  if (p.falta === "codigo_debito") {
    p.motivo = `A categoria "${rotuloDaCategoria(p.categoria)}" ainda não tem código de débito. Cadastre o código em Regras por categoria: um cadastro resolve todos os documentos dela.`;
    return;
  }
  const chave = chaveDoNome(p.rotulo);
  if (p.temDocumento) {
    p.motivo = `Tem CPF/CNPJ (${p.chave}), mas ainda não há conta de crédito para ele no de-para da etapa 3. Clique em definir regra: a conta cadastrada vale para todos os pagamentos dele.`;
    // Com documento o plano só sugere, não lança: a conta de nome igual vai pré-preenchida na regra.
    const mesma = chave ? plano.unica(chave) : null;
    p.sugestao = mesma ? resumo(mesma, 1) : chave ? plano.sugerir(chave) : null;
    if (p.sugestao) p.motivo += ` No plano há uma conta ${(p.sugestao.semelhanca ?? 0) >= 1 ? "com o mesmo nome" : "de nome parecido"} ("${p.sugestao.nome}"): ela já vai preenchida na regra.`;
    return;
  }
  if (p.chave === "(sem identificação)") {
    p.motivo = "Veio sem CPF/CNPJ e sem nome: não há como saber a quem se pagou. Abra o documento e corrija o nome ou o CPF/CNPJ em Documentos lidos.";
    return;
  }
  p.homonimos = plano.homonimos(chave).map((c) => resumo(c));
  if (p.homonimos.length > 1) {
    p.motivo = `Veio sem CPF/CNPJ, e o plano de contas tem ${p.homonimos.length} contas com este mesmo nome. O sistema não escolhe sozinho entre homônimos: escolha a conta certa abaixo para confirmar na etapa 3.`;
    return;
  }
  p.sugestao = chave ? plano.sugerir(chave) : null;
  p.motivo = p.sugestao
    ? `Veio sem CPF/CNPJ, e no plano de contas não há conta com o nome exatamente igual. A mais parecida é "${p.sugestao.nome}" (${Math.round((p.sugestao.semelhanca ?? 0) * 100)}% igual): clique em definir regra e confira na etapa 3, onde ela já vai preenchida.`
    : "Veio sem CPF/CNPJ, e não há conta de fornecedor com este nome no plano de contas. Clique em definir regra e informe a conta na etapa 3; ou corrija o CPF/CNPJ em Documentos lidos; ou crie o fornecedor na Domínio e recarregue o plano.";
}

// ---- a conferência ----------------------------------------------------------

/** O que a leitura do documento disse. Só "ok" conta; a decisão de uma pessoa vence. */
export type SituacaoDoPagamento = "ok" | "via" | "conferir" | "invalido";
export type DecisaoDoPagamento = "" | "aceito" | "descartado";

export function situacaoEfetiva(situacao: string, decisao: string): string {
  if (decisao === "aceito") return "ok";
  if (decisao === "descartado") return "descartado";
  return situacao;
}

/** O pagamento conta para o lançamento: situação efetiva "ok" e não é contrato de locação, que é cadastro e não pagamento. */
export function entraNoLancamento(l: { situacao: string; decisao: string; tipo: string; tipoCorrigido?: string }): boolean {
  return situacaoEfetiva(l.situacao, l.decisao) === "ok" && ((l.tipoCorrigido ?? "").trim() || l.tipo) !== "contrato_locacao";
}

/** O motorista que o passo 5 lança num mês — para a NFS-e do MEI dele não entrar em dobro nas entradas. */
export function motoristasDoMes(pagamentos: readonly Pagamento[]) {
  const ROTULO_DO_MOTORISTA: Record<string, string> = { contrato_motorista: "contrato de motorista", recibo_motorista: "recibo de motorista", rpa: "RPA" };
  const porDocumento = new Map<string, string>();
  const porNome = new Map<string, string>();
  for (const p of pagamentos) {
    const categoria = categoriaDoPagamento(p);
    const rotulo = ROTULO_DO_MOTORISTA[categoria];
    if (!rotulo) continue;
    if (categoria === "rpa" && (verbasDesconhecidas(p).length || !competenciaDoRpa(p))) continue;
    const documento = p.documento.replace(/\D/g, "");
    if (documento && !porDocumento.has(documento)) porDocumento.set(documento, rotulo);
    const nome = chaveDoNome(p.nome);
    if (nome.split(" ").length >= 2 && !porNome.has(nome)) porNome.set(nome, rotulo);
  }
  return (documento: string, nome: string): string => {
    const achado = porDocumento.get((documento ?? "").replace(/\D/g, ""));
    if (achado) return achado;
    const chave = chaveDoNome(nome);
    return chave.split(" ").length >= 2 ? porNome.get(chave) ?? "" : "";
  };
}
