// O de-para contábil e o relatório de lançamentos (29/10/2026), portados de
// `depara_contabil.py` (SPED Generator) para o Connect processar. Puro: recebe
// as entradas, as regras e as contas-modelo e devolve lançamentos, pendências
// e descartados. Quem lê o banco é `servidor.ts`.
//
// CONTA CONTÁBIL NÃO SE ADIVINHA. Fornecedor fora do de-para sai como
// pendência, com valor e quantidade, jamais com uma conta chutada: lançamento
// em conta errada é pior que lançamento ausente, porque o ausente aparece no
// fechamento e o errado não.
//
// O que mudou na vinda:
// - as contas fixas (débito do CT-e, da NFS-e e do imobilizado) eram da BLD e
//   estavam no código; aqui são da empresa (`ContabilModelo`). Sem elas, o
//   CT-e, a NFS-e e o imobilizado seguem a regra do fornecedor como a NF-e;
// - dinheiro em centavos inteiros, não float;
// - a NFS-e do motorista que o passo 5 já lança não entra: pagamentos sem nota
//   ainda não vieram para o Connect.

export const NFE = "NF-e";
export const CTE = "CT-e";
export const NFSE = "NFS-e";
export type TipoDaEntrada = typeof NFE | typeof CTE | typeof NFSE;
export const TIPOS_DA_ENTRADA: TipoDaEntrada[] = [NFE, CTE, NFSE];

/** Um documento de entrada, com o que o lançamento precisa. */
export type Entrada = {
  chave: string;
  tipo: TipoDaEntrada;
  /** O fornecedor (emitente; o prestador na NFS-e), só dígitos. */
  cnpj: string;
  nome: string;
  numero: string;
  serie: string;
  /** "AAAA-MM-DD". */
  data: string;
  centavos: number;
  /** Ordenados. Vazio na NFS-e e na nota que chegou sem XML. */
  cfops: string[];
  cancelada: boolean;
};

export type Regra = {
  cnpjFornecedor: string;
  cfop: string;
  nomeFornecedor: string;
  contaDebito: string;
  contaCredito: string;
  codigoHistorico: string;
  historico: string;
  desconsiderar: boolean;
};

export type Modelos = {
  debitoCte: string;
  debitoNfse: string;
  contaImobilizado: string;
  historicoImobilizado: string;
};

export const MODELOS_VAZIOS: Modelos = { debitoCte: "", debitoNfse: "", contaImobilizado: "", historicoImobilizado: "" };

export type OrigemDoCredito = "regra" | "outra_regra" | "plano_nome" | "plano_cnpj";
export const ROTULO_DA_ORIGEM: Record<OrigemDoCredito, string> = {
  regra: "regra do fornecedor",
  outra_regra: "outra regra do fornecedor",
  plano_nome: "nome igual no plano",
  plano_cnpj: "CNPJ do MEI no nome da conta",
};

export type Lancamento = {
  debito: string;
  credito: string;
  centavos: number;
  data: string;
  codigoHistorico: string;
  historico: string;
  cnpjFornecedor: string;
  nomeFornecedor: string;
  chave: string;
  cfop: string;
  numero: string;
  tipo: TipoDaEntrada;
  /** Compra de imobilizado: o contábil confere uma a uma antes de transferir da conta genérica. */
  imobilizado: boolean;
  origemDoCredito: OrigemDoCredito;
};

/** Entradas sem de-para, uma linha por fornecedor e CFOP: a conta se preenche uma vez, não trezentas. */
export type Pendencia = {
  cnpjFornecedor: string;
  nomeFornecedor: string;
  cfop: string;
  qtd: number;
  centavos: number;
  /** Há regra, mas com a conta em branco — o de-para pela metade. */
  cadastradaSemConta: boolean;
  tipos: TipoDaEntrada[];
  /** O débito é fixo pelo tipo (CT-e, NFS-e, imobilizado): da regra só falta o crédito. */
  soCredito: boolean;
};

export type MotivoDoDescarte = "cancelado" | "valor_zero" | "desconsiderado";

/** O que nunca vira lançamento sai contado, para a conta das notas fechar. */
export type Descartado = {
  motivo: MotivoDoDescarte;
  rotulo: string;
  qtd: number;
  centavos: number;
  /** A chave da regra que descartou — é com ela que a tela desfaz. */
  cnpj: string;
  cfop: string;
};

export type Relatorio = { lancamentos: Lancamento[]; pendencias: Pendencia[]; descartados: Descartado[] };

/** A conta de crédito do fornecedor achada no plano (CT-e e NFS-e sem regra). */
export type ContaNoPlano = (cnpj: string, nome: string) => { conta: string; origem: OrigemDoCredito; nome: string } | null;

/**
 * Compra de bem do ativo (Contábil, 07/10/2026): a nota inteira vai para a
 * conta genérica de imobilizado quando qualquer CFOP dela é destes, e o
 * contábil transfere à mão depois de lançar o bem no Patrimonial.
 */
export const CFOPS_IMOBILIZADO = new Set(["1551", "2551", "3551", "1406", "2406"]);

/** O complemento de quem não escreveu outro (Contábil, 02/10/2026). Sai sem código de histórico. */
export const HISTORICO_PADRAO = "COMPRAS NF {nf} {fornecedor}";
const COMPLEMENTO_IMOBILIZADO = "{nf} - {fornecedor}";
export const COMPLEMENTO_DO_MODELO: Record<typeof CTE | typeof NFSE, string> = {
  [CTE]: "SERVIÇOS DE TRANSPORTE CTE N° {nf} {fornecedor}",
  [NFSE]: "SERVIÇO TOMADO NF {nf} {fornecedor}",
};
export const CORINGAS_DO_HISTORICO = ["{nf}", "{fornecedor}", "{data}", "{cfop}", "{serie}"] as const;

/** Um documento pode ter vários CFOP; o de-para é por documento, então vale o primeiro em ordem. */
export const cfopPrincipal = (e: Entrada) => e.cfops[0] ?? "";

/** O CFOP da regra e da pendência. Na compra de imobilizado é o do bem, mesmo quando não é o primeiro. */
export function cfopDaRegra(e: Entrada): string {
  return e.cfops.find((c) => CFOPS_IMOBILIZADO.has(c)) ?? cfopPrincipal(e);
}

const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Maiúsculo, sem acento e sem pontuação — só para comparar nomes. */
export function semMarcas(texto: string): string {
  return (texto ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Troca os coringas do complemento pelos dados daquela nota. */
export function aplicarCoringas(modelo: string, e: Entrada, fornecedor = ""): string {
  const texto = (modelo ?? "").trim();
  if (!texto.includes("{")) return texto;
  return texto
    .replaceAll("{nf}", e.numero)
    .replaceAll("{serie}", e.serie)
    .replaceAll("{fornecedor}", e.nome || fornecedor || e.cnpj)
    .replaceAll("{data}", dataBr(e.data))
    .replaceAll("{cfop}", cfopPrincipal(e));
}

/**
 * O histórico terminando no nome do fornecedor (Contábil, 19/10/2026). Não
 * repete o nome quando o texto já termina num dos `nomes`, comparados sem
 * acento e sem pontuação.
 */
export function fornecedorNoFim(historico: string, ...nomes: string[]): string {
  const texto = (historico ?? "").trim();
  const validos = nomes.map((n) => (n ?? "").trim()).filter(Boolean);
  if (!validos.length) return texto;
  const fim = semMarcas(texto);
  if (validos.some((n) => fim.endsWith(semMarcas(n)))) return texto;
  return `${texto} ${validos[0]}`.trim();
}

const chaveDaRegra = (cnpj: string, cfop: string) => `${cnpj}|${cfop}`;

/**
 * A específica por CFOP, depois o padrão do fornecedor. A regra de CFOP para
 * qualquer fornecedor só conta quando é de exclusão — uma conta valendo para
 * todo mundo de um CFOP lançaria fornecedor que ninguém cadastrou.
 */
function acharRegra(indice: Map<string, Regra>, cnpj: string, cfop: string): Regra | null {
  const achada = indice.get(chaveDaRegra(cnpj, cfop)) ?? indice.get(chaveDaRegra(cnpj, ""));
  if (achada) return achada;
  const geral = indice.get(chaveDaRegra("", cfop));
  return geral?.desconsiderar ? geral : null;
}

function rotuloDoCancelado(e: Entrada): string {
  return e.tipo === NFSE ? "NFS-e cancelada na prefeitura" : `${e.tipo} cancelada`;
}

function ordemDaEntrada(a: Entrada, b: Entrada): number {
  return a.data.localeCompare(b.data) || a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
}

/** (lançamentos, pendências, descartados) das entradas do período. */
export function montarRelatorio(entradas: readonly Entrada[], regras: readonly Regra[], modelos: Modelos = MODELOS_VAZIOS, contaNoPlano?: ContaNoPlano): Relatorio {
  const indice = new Map(regras.map((r) => [chaveDaRegra(r.cnpjFornecedor, r.cfop), r]));
  // A conta de crédito do fornecedor, de qualquer regra dele: serve onde o
  // débito é fixo (imobilizado, CT-e, NFS-e), em que só o crédito importa.
  const creditoDoFornecedor = new Map<string, Regra>();
  for (const r of regras) {
    if (r.cnpjFornecedor && r.contaCredito && !r.desconsiderar && !creditoDoFornecedor.has(r.cnpjFornecedor)) {
      creditoDoFornecedor.set(r.cnpjFornecedor, { ...r, cfop: "", contaDebito: "", historico: "", codigoHistorico: "" });
    }
  }
  const lancamentos: Lancamento[] = [];
  const pendencias = new Map<string, Pendencia>();
  const descartados = new Map<string, Descartado>();
  const descartar = (motivo: MotivoDoDescarte, rotulo: string, e: Entrada, cnpj = "", cfop = "") => {
    const k = `${motivo}|${rotulo}`;
    const d = descartados.get(k) ?? { motivo, rotulo, qtd: 0, centavos: 0, cnpj, cfop };
    d.qtd += 1;
    d.centavos += e.centavos;
    descartados.set(k, d);
  };

  for (const e of [...entradas].sort(ordemDaEntrada)) {
    if (e.cancelada) {
      descartar("cancelado", rotuloDoCancelado(e), e);
      continue;
    }
    // A Domínio recusa lançamento de valor zero, e não há o que provisionar.
    if (e.centavos === 0) {
      descartar("valor_zero", `${e.tipo} com valor zero`, e);
      continue;
    }
    const imobilizado = !!modelos.contaImobilizado && e.cfops.some((c) => CFOPS_IMOBILIZADO.has(c));
    const debitoDoModelo = e.tipo === CTE ? modelos.debitoCte : e.tipo === NFSE ? modelos.debitoNfse : "";
    const temModelo = !!debitoDoModelo;
    const cfop = cfopDaRegra(e);
    let regra: Regra | null = null;
    let origem: OrigemDoCredito = "regra";
    if (e.cnpj) {
      regra = acharRegra(indice, e.cnpj, cfop);
      if (!regra && imobilizado) regra = acharRegra(indice, e.cnpj, cfopPrincipal(e));
      if ((imobilizado || temModelo) && !regra?.desconsiderar && !regra?.contaCredito && creditoDoFornecedor.has(e.cnpj)) {
        regra = creditoDoFornecedor.get(e.cnpj)!;
        origem = "outra_regra";
      }
      // Sem regra nenhuma, a conta do fornecedor no plano — só para o CT-e e a
      // NFS-e, e só quando ela é única. O lançamento leva a origem, para ser conferido.
      if (temModelo && contaNoPlano && !regra?.desconsiderar && !regra?.contaCredito) {
        const achada = contaNoPlano(e.cnpj, e.nome);
        if (achada) {
          regra = {
            cnpjFornecedor: e.cnpj, cfop: regra?.cfop ?? "", nomeFornecedor: regra?.nomeFornecedor || achada.nome,
            contaDebito: "", contaCredito: achada.conta, codigoHistorico: "", historico: "", desconsiderar: false,
          };
          origem = achada.origem;
        }
      }
    }
    if (regra?.desconsiderar) {
      const escopo = regra.cnpjFornecedor ? `${regra.nomeFornecedor || regra.cnpjFornecedor} / CFOP ${cfopPrincipal(e) || "—"}` : `CFOP ${cfopPrincipal(e) || "—"}`;
      descartar("desconsiderado", escopo, e, regra.cnpjFornecedor, regra.cfop);
      continue;
    }

    const debitoFixo = imobilizado || temModelo;
    if (!regra || !regra.contaCredito || (!debitoFixo && !regra.contaDebito)) {
      const k = chaveDaRegra(e.cnpj, cfop);
      const p = pendencias.get(k) ?? { cnpjFornecedor: e.cnpj, nomeFornecedor: e.nome, cfop, qtd: 0, centavos: 0, cadastradaSemConta: !!regra, tipos: [], soCredito: debitoFixo };
      if (!p.tipos.includes(e.tipo)) p.tipos.push(e.tipo);
      if (!p.nomeFornecedor && e.nome) p.nomeFornecedor = e.nome;
      p.qtd += 1;
      p.centavos += e.centavos;
      pendencias.set(k, p);
      continue;
    }

    // O nome, quando a nota não traz o dela (NFS-e municipal), sai da regra.
    const nome = e.nome || regra.nomeFornecedor.trim();
    let debito: string, codigoHistorico: string, historico: string;
    if (imobilizado) {
      [debito, codigoHistorico] = [modelos.contaImobilizado, modelos.historicoImobilizado];
      historico = aplicarCoringas(COMPLEMENTO_IMOBILIZADO, e, nome);
    } else if (temModelo) {
      [debito, codigoHistorico] = [debitoDoModelo, ""];
      historico = aplicarCoringas(COMPLEMENTO_DO_MODELO[e.tipo as typeof CTE | typeof NFSE], e, nome);
    } else {
      [debito, codigoHistorico] = [regra.contaDebito, regra.codigoHistorico];
      historico = aplicarCoringas(regra.historico.trim() || HISTORICO_PADRAO, e, nome);
    }
    lancamentos.push({
      debito, credito: regra.contaCredito, centavos: e.centavos, data: e.data,
      codigoHistorico, historico: fornecedorNoFim(historico, nome, regra.nomeFornecedor),
      cnpjFornecedor: e.cnpj, nomeFornecedor: nome, chave: e.chave, cfop, numero: e.numero, tipo: e.tipo,
      imobilizado, origemDoCredito: origem,
    });
  }

  return {
    lancamentos,
    pendencias: [...pendencias.values()].sort((a, b) => b.centavos - a.centavos),
    descartados: [...descartados.values()].sort((a, b) => a.motivo.localeCompare(b.motivo) || b.qtd - a.qtd),
  };
}

/** Uma conta do plano da Domínio. */
export type ContaDoPlano = { reduzido: string; classificacao: string; nome: string };

const TIPO_EMPRESA = new Set(["LTDA", "ME", "EPP", "EIRELI", "MEI", "SA"]);

/**
 * O nome reduzido ao que identifica o fornecedor: sem acento e pontuação, sem
 * o documento que a Domínio escreve na frente do nome ("44.099.672 JADISON")
 * ou cola no fim, e sem o tipo de empresa no fim. Número curto no fim fica:
 * "AUTO POSTO X 01" e "AUTO POSTO X 03" são estabelecimentos diferentes.
 */
export function chaveDoNome(nome: string): string {
  const partes = semMarcas(nome).split(" ").filter(Boolean);
  while (partes.length && /^\d+$/.test(partes[0])) partes.shift();
  while (partes.length) {
    const ultima = partes[partes.length - 1];
    if (/^\d{8,}$/.test(ultima) || TIPO_EMPRESA.has(ultima)) partes.pop();
    else if (partes.slice(-2).join(" ") === "S A") partes.splice(-2);
    else break;
  }
  return partes.join(" ");
}

// A raiz do CNPJ do MEI na frente do nome da conta ("48.392.479 JANAINA ..."),
// como a Domínio nomeia a analítica do microempreendedor.
const RAIZ_NO_NOME = /^\s*(\d{2})\.?(\d{3})\.?(\d{3})(?!\d)/;

/**
 * A conta de crédito no plano do fornecedor sem regra. Duas provas, cada uma
 * só valendo quando aponta para UMA conta: a raiz do CNPJ no nome da conta e o
 * nome igual (com pelo menos duas palavras). Homônimo ou provas discordando
 * não casam — na dúvida, é pendência para uma pessoa decidir.
 */
export function contaNoPlano(contas: readonly ContaDoPlano[]): ContaNoPlano {
  const porRaiz = new Map<string, ContaDoPlano[]>();
  const porNome = new Map<string, ContaDoPlano[]>();
  for (const c of contas) {
    const m = RAIZ_NO_NOME.exec(c.nome);
    if (m) porRaiz.set(m[1] + m[2] + m[3], [...(porRaiz.get(m[1] + m[2] + m[3]) ?? []), c]);
    const chave = chaveDoNome(c.nome);
    if (chave) porNome.set(chave, [...(porNome.get(chave) ?? []), c]);
  }
  return (cnpj, nome) => {
    const raiz = cnpj.replace(/\D/g, "").slice(0, 8);
    const daRaiz = raiz.length === 8 ? porRaiz.get(raiz) ?? [] : [];
    const pelaRaiz = daRaiz.length === 1 ? daRaiz[0] : null;
    const chave = chaveDoNome(nome);
    const doNome = chave.split(" ").length >= 2 ? porNome.get(chave) ?? [] : [];
    const peloNome = doNome.length === 1 ? doNome[0] : null;
    if (pelaRaiz && peloNome && pelaRaiz.reduzido !== peloNome.reduzido) return null;
    if (pelaRaiz) return { conta: pelaRaiz.reduzido, origem: "plano_cnpj", nome: pelaRaiz.nome };
    if (peloNome) return { conta: peloNome.reduzido, origem: "plano_nome", nome: peloNome.nome };
    return null;
  };
}
