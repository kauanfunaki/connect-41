// Leitura de XML fiscal do layout nacional da SEFAZ: NF-e, NFC-e e CT-e.
//
// Etapa 2 da Fase 2. O protótipo do 41-BPO tem um extrator equivalente e ele se
// declara descartável no próprio comentário — lê meia dúzia de tags por posição
// de bloco. Isto aqui é a versão que fica: XML de verdade, com namespace, com
// as armadilhas do layout tratadas e com o dado conferido contra si mesmo.
//
// NFS-e entrou depois (etapa 5), e continua sendo outra história: não tem chave
// de acesso nacional, cada município monta o XML do seu jeito, e a adesão ao
// padrão nacional é parcial. O que dá para fazer de forma determinística está
// aqui — as duas famílias de layout que cobrem quase tudo (ABRASF e padrão
// nacional). O resíduo municipal é onde a IA entra, numa etapa posterior, e não
// aqui: chutar campo em parser é como se lê o número do lote achando que é o
// número da nota.

import { XMLParser } from "fast-xml-parser";

export type TipoDocumentoFiscal = "NFE" | "NFCE" | "CTE" | "NFSE";

export type ParteDoDocumento = {
  nome: string | null;
  /** CNPJ (14) ou CPF (11), só dígitos. */
  documento: string | null;
};

export type DocumentoFiscalExtraido = {
  tipo: TipoDocumentoFiscal;
  /**
   * 44 dígitos, já conferida contra o dígito verificador.
   *
   * **`null` em NFS-e**, sempre: ela é municipal e não tem chave nacional. É por
   * isso que a identidade do acervo é a `dedupKey` e não esta coluna — ver
   * `chaveDeDeduplicacao` em src/lib/fiscal/documentos.ts.
   */
  chaveAcesso: string | null;
  numero: string;
  serie: string;
  emitidoEm: Date;
  emitente: ParteDoDocumento;
  destinatario: ParteDoDocumento;
  /**
   * Valor total **como string**, exatamente como veio do XML.
   *
   * Nunca `number`: dinheiro no Connect é `Decimal(12,2)`, e passar por float
   * para depois voltar é como o protótipo perde centavo. A string vai direto
   * para o Prisma, que a entrega ao MySQL sem intermediário binário.
   */
  valorTotal: string;
  /**
   * Competência declarada no XML, "AAAA-MM", quando existe.
   *
   * Só NFS-e tem. E importa: o serviço prestado em agosto pode ser faturado em
   * setembro, e o ABRASF traz `<Competencia>` exatamente para dizer a qual mês
   * a nota pertence. Derivar da data de emissão jogaria essa nota na
   * competência errada — que é o mês que o contador fecha.
   */
  competenciaDeclarada: string | null;
  /**
   * A nota já nasce cancelada no arquivo.
   *
   * O ABRASF entrega `<NfseCancelamento>` dentro do mesmo `<CompNfse>`. Ignorar
   * isso colocaria uma nota cancelada no acervo como autorizada, e ela entraria
   * na fila de lançamento.
   */
  cancelada: boolean;
};

export type MotivoRecusa =
  | "xml_invalido"
  | "documento_desconhecido"
  | "chave_ausente"
  | "chave_invalida"
  | "campo_obrigatorio_ausente";

export type ResultadoLeitura =
  | { ok: true; documento: DocumentoFiscalExtraido }
  | { ok: false; motivo: MotivoRecusa; detalhe: string };

function recusa(motivo: MotivoRecusa, detalhe: string): ResultadoLeitura {
  return { ok: false, motivo, detalhe };
}

// `removeNSPrefix` tira o `nfe:`/`ns2:` que cada emissor põe do seu jeito.
// `ignoreAttributes: false` é obrigatório: a chave de acesso mora num ATRIBUTO.
// `parseTagValue: false` mantém tudo como string — é o que preserva "1234.50"
// sem virar 1234.5, e o número da nota "000123" sem virar 123.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

type No = Record<string, unknown>;

function ehObjeto(v: unknown): v is No {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Primeiro filho com este nome. Array vira o primeiro item — emissor repete tag. */
function filho(no: unknown, nome: string): unknown {
  if (!ehObjeto(no)) return undefined;
  const v = no[nome];
  return Array.isArray(v) ? v[0] : v;
}

/** Navega um caminho de tags. Qualquer degrau ausente devolve undefined. */
function caminho(raiz: unknown, ...nomes: string[]): unknown {
  let atual: unknown = raiz;
  for (const n of nomes) {
    atual = filho(atual, n);
    if (atual === undefined) return undefined;
  }
  return atual;
}

function texto(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  // Tag com atributo vira objeto e o conteúdo cai em "#text".
  if (ehObjeto(v) && typeof v["#text"] === "string") return v["#text"].trim() || null;
  return null;
}

function digitos(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const d = t.replace(/\D/g, "");
  return d || null;
}

/**
 * Confere o 44º dígito da chave de acesso (módulo 11, pesos 2..9 da direita).
 *
 * Vale a pena porque a chave é a identidade do documento em todo o módulo — é
 * ela que deduplica. Chave corrompida que passasse aqui viraria um documento
 * novo a cada reenvio do mesmo arquivo, e ninguém perceberia até o acervo estar
 * cheio de duplicata.
 */
export function chaveDeAcessoValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = 11 - (soma % 11);
  const dv = resto >= 10 ? 0 : resto;
  return dv === Number(chave[43]);
}

/** O modelo fiscal vive nas posições 21-22 da chave. 55 = NF-e, 65 = NFC-e, 57 = CT-e. */
export function modeloDaChave(chave: string): string {
  return chave.slice(20, 22);
}

/**
 * Chave de acesso a partir do atributo `Id` do bloco de informações.
 *
 * **Não** se lê de uma tag `<chNFe>`, e essa é a armadilha central deste
 * layout: `<chNFe>` também aparece dentro de `<NFref>` (nota referenciada, em
 * devolução e complemento) e dentro da lista de documentos transportados de um
 * CT-e. Pegar a primeira ocorrência daria a chave de OUTRO documento — é o
 * mesmo erro de casar `<Numero>` e levar `<NumeroLote>`, um nível mais fundo e
 * bem mais caro, porque a chave é o que deduplica o acervo.
 *
 * O `Id` vem como "NFe4126…" ou "CTe4126…"; o prefixo sai, sobram 44 dígitos.
 */
function chaveDoId(inf: unknown): string | null {
  const id = texto(filho(inf, "@Id"));
  if (!id) return null;
  const d = id.replace(/\D/g, "");
  return d.length === 44 ? d : null;
}

function parte(no: unknown): ParteDoDocumento {
  return {
    nome: texto(filho(no, "xNome")),
    documento: digitos(filho(no, "CNPJ")) ?? digitos(filho(no, "CPF")),
  };
}

/**
 * Data de emissão. O layout usa `dhEmi` (ISO com fuso) desde a NF-e 3.10 e
 * `dEmi` (só data) antes disso; CT-e usa `dhEmi`. Data inválida é recusa, não
 * "hoje": documento fiscal sem data é documento que não dá para competenciar.
 */
function dataDeEmissao(ide: unknown): Date | null {
  const bruto = texto(filho(ide, "dhEmi")) ?? texto(filho(ide, "dEmi"));
  if (!bruto) return null;
  const d = new Date(bruto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Documento de uma parte no ABRASF.
 *
 * O CNPJ vem embrulhado em `<CpfCnpj>` com `<Cnpj>` ou `<Cpf>` dentro — o
 * embrulho existe justamente porque o prestador pode ser pessoa física. Alguns
 * municípios entregam `<Cnpj>` solto, sem o embrulho; os dois caminhos são
 * tentados, nessa ordem.
 */
function documentoAbrasf(no: unknown): string | null {
  const cpfCnpj = filho(no, "CpfCnpj");
  return (
    digitos(filho(cpfCnpj, "Cnpj")) ??
    digitos(filho(cpfCnpj, "Cpf")) ??
    digitos(filho(no, "Cnpj")) ??
    digitos(filho(no, "Cpf"))
  );
}

/**
 * "AAAA-MM" a partir do que o XML chama de competência.
 *
 * Vem em formatos diferentes conforme a versão do ABRASF: data ISO completa
 * ("2026-08-01T00:00:00"), só data ("2026-08-01") ou já "AAAA-MM". Os três
 * começam com ano-mês, então o corte é suficiente — e mais seguro que `new
 * Date()`, que interpreta "2026-08" como UTC e pode voltar julho em fuso
 * negativo.
 */
function competenciaDeclarada(bruto: string | null): string | null {
  if (!bruto || bruto.length < 7) return null;
  const recorte = bruto.slice(0, 7);
  return recorte.length === 7 && recorte[4] === "-" ? recorte : null;
}

/**
 * NFS-e — ABRASF e padrão nacional.
 *
 * As duas famílias entram pela mesma porta porque a diferença entre elas é de
 * nome de tag, não de conceito: as duas têm número, série, emissão, prestador,
 * tomador e valor. O que muda é onde cada um mora, e é isso que os `??` em
 * cascata resolvem.
 *
 * Não há chave de acesso, e é o ponto: a identidade sai da `dedupKey` composta.
 */
function lerNfse(comp: unknown, raiz: unknown): ResultadoLeitura {
  // ABRASF: CompNfse > Nfse > InfNfse. Padrão nacional: NFSe > infNFSe.
  const inf =
    caminho(comp, "Nfse", "InfNfse") ?? filho(comp, "InfNfse") ?? filho(comp, "infNFSe") ?? comp;

  // A declaração de prestação (ABRASF 2.x) guarda RPS, competência e serviço.
  const decl = caminho(inf, "DeclaracaoPrestacaoServico", "InfDeclaracaoPrestacaoServico");
  // Padrão nacional: os dados de origem ficam no DPS.
  const dps = caminho(inf, "DPS", "infDPS");

  const numero =
    texto(filho(inf, "Numero")) ?? texto(filho(inf, "nNFSe")) ?? texto(caminho(dps, "nDPS"));
  if (!numero) return recusa("campo_obrigatorio_ausente", "número da NFS-e ausente");

  const serie =
    texto(caminho(decl, "Rps", "IdentificacaoRps", "Serie")) ??
    texto(filho(inf, "Serie")) ??
    texto(filho(dps, "serie"));

  const emissaoBruta =
    texto(filho(inf, "DataEmissao")) ??
    texto(filho(inf, "dhProc")) ??
    texto(filho(dps, "dhEmi")) ??
    texto(caminho(decl, "Competencia"));
  if (!emissaoBruta) return recusa("campo_obrigatorio_ausente", "data de emissão da NFS-e ausente");
  const emitidoEm = new Date(emissaoBruta);
  if (Number.isNaN(emitidoEm.getTime())) {
    return recusa("campo_obrigatorio_ausente", `data de emissão inválida: ${emissaoBruta}`);
  }

  // Valor do serviço, não o líquido.
  //
  // `ValorLiquidoNfse` é o serviço menos as retenções, e retenção é assunto do
  // lançamento, não do documento: o valor da nota é o que foi contratado. Usar o
  // líquido faria o acervo divergir do que está impresso no DANFSE.
  const valorTotal =
    texto(caminho(inf, "Servico", "Valores", "ValorServicos")) ??
    texto(caminho(decl, "Servico", "Valores", "ValorServicos")) ??
    texto(caminho(dps, "serv", "valores", "vServPrest", "vServ")) ??
    texto(caminho(inf, "valores", "vServ"));
  if (!valorTotal) return recusa("campo_obrigatorio_ausente", "valor do serviço ausente");

  const prestador =
    filho(inf, "PrestadorServico") ?? filho(decl, "Prestador") ?? filho(inf, "emit") ?? filho(dps, "prest");
  const tomador =
    filho(inf, "TomadorServico") ?? filho(decl, "Tomador") ?? filho(dps, "toma");

  const emitente: ParteDoDocumento = {
    nome: texto(filho(prestador, "RazaoSocial")) ?? texto(filho(prestador, "xNome")),
    documento: documentoAbrasf(filho(prestador, "IdentificacaoPrestador")) ??
      documentoAbrasf(prestador) ??
      digitos(filho(prestador, "CNPJ")),
  };
  const destinatario: ParteDoDocumento = {
    nome: texto(filho(tomador, "RazaoSocial")) ?? texto(filho(tomador, "xNome")),
    documento: documentoAbrasf(filho(tomador, "IdentificacaoTomador")) ??
      documentoAbrasf(tomador) ??
      digitos(filho(tomador, "CNPJ")),
  };

  if (!emitente.documento) return recusa("campo_obrigatorio_ausente", "prestador sem CNPJ/CPF");

  return {
    ok: true,
    documento: {
      tipo: "NFSE",
      chaveAcesso: null,
      numero,
      serie: serie ?? "",
      emitidoEm,
      emitente,
      destinatario,
      valorTotal,
      competenciaDeclarada:
        competenciaDeclarada(texto(filho(inf, "Competencia"))) ??
        competenciaDeclarada(texto(filho(decl, "Competencia"))) ??
        competenciaDeclarada(texto(filho(dps, "dCompet"))),
      // O cancelamento vem no mesmo envelope, ao lado da nota — e não dentro
      // dela. Por isso a raiz é conferida, não o bloco de informações.
      cancelada:
        filho(raiz, "NfseCancelamento") !== undefined ||
        filho(comp, "NfseCancelamento") !== undefined,
    },
  };
}

/** Lê um XML de NF-e, NFC-e, CT-e ou NFS-e. Não lança: devolve o motivo da recusa. */
export function lerXmlFiscal(xml: string): ResultadoLeitura {
  if (!xml || !xml.trim()) return recusa("xml_invalido", "arquivo vazio");

  let arvore: unknown;
  try {
    arvore = parser.parse(xml);
  } catch (err) {
    return recusa("xml_invalido", err instanceof Error ? err.message : "não foi possível ler o XML");
  }
  if (!ehObjeto(arvore)) return recusa("xml_invalido", "raiz não é um elemento");

  // O arquivo distribuído pela SEFAZ vem embrulhado em `nfeProc`/`cteProc`; o
  // gerado pelo emissor, não. Os dois são válidos e chegam na entrada.
  const nfe = caminho(arvore, "nfeProc", "NFe") ?? filho(arvore, "NFe");
  const cte = caminho(arvore, "cteProc", "CTe") ?? filho(arvore, "CTe");

  if (nfe !== undefined) return lerNfe(nfe);
  if (cte !== undefined) return lerCte(cte);

  // NFS-e, nas formas que aparecem na prática: o envelope de consulta
  // (`ConsultarNfseResposta` > `ListaNfse` > `CompNfse`), o `CompNfse` solto, o
  // `Nfse` sozinho, e o padrão nacional (`NFSe`).
  const nfse =
    caminho(arvore, "ConsultarNfseResposta", "ListaNfse", "CompNfse") ??
    caminho(arvore, "ConsultarNfseRpsResposta", "CompNfse") ??
    caminho(arvore, "ListaNfse", "CompNfse") ??
    filho(arvore, "CompNfse") ??
    filho(arvore, "Nfse") ??
    filho(arvore, "NFSe");
  if (nfse !== undefined) return lerNfse(nfse, arvore);

  return recusa(
    "documento_desconhecido",
    `raiz "${Object.keys(arvore).filter((k) => k !== "?xml")[0] ?? "?"}" não é NF-e, NFC-e, CT-e nem NFS-e`
  );
}

function lerNfe(nfe: unknown): ResultadoLeitura {
  const inf = filho(nfe, "infNFe");
  if (inf === undefined) return recusa("campo_obrigatorio_ausente", "infNFe ausente");

  const chave = chaveDoId(inf);
  if (!chave) return recusa("chave_ausente", "atributo Id de infNFe sem 44 dígitos");
  if (!chaveDeAcessoValida(chave)) return recusa("chave_invalida", `dígito verificador não confere: ${chave}`);

  const ide = filho(inf, "ide");
  const numero = texto(filho(ide, "nNF"));
  const serie = texto(filho(ide, "serie"));
  const emitidoEm = dataDeEmissao(ide);
  if (!numero) return recusa("campo_obrigatorio_ausente", "ide/nNF ausente");
  if (!emitidoEm) return recusa("campo_obrigatorio_ausente", "ide/dhEmi ausente ou inválida");

  // O total fica em ICMSTot/vNF. `vProd` é só a soma das mercadorias, sem
  // frete, seguro nem desconto — usar ele daria uma nota mais barata do que a
  // que o cliente pagou.
  const valorTotal = texto(caminho(inf, "total", "ICMSTot", "vNF"));
  if (!valorTotal) return recusa("campo_obrigatorio_ausente", "total/ICMSTot/vNF ausente");

  // O modelo sai da chave, não da tag `mod`: a chave é o dado conferido pelo
  // dígito verificador, e as duas discordarem significa arquivo adulterado.
  const modelo = modeloDaChave(chave);
  const tipo: TipoDocumentoFiscal = modelo === "65" ? "NFCE" : "NFE";

  return {
    ok: true,
    documento: {
      tipo,
      chaveAcesso: chave,
      numero,
      serie: serie ?? "0",
      emitidoEm,
      emitente: parte(filho(inf, "emit")),
      // NFC-e ao consumidor não identificado não tem `dest` — é venda de
      // balcão, e isso é normal, não erro.
      destinatario: parte(filho(inf, "dest")),
      valorTotal,
      // NF-e não declara competência: ela é o mês da emissão, e o chamador
      // deriva. E cancelamento de NF-e vem em evento separado, não no XML da
      // nota — por isso é sempre falso aqui, nunca "não sei".
      competenciaDeclarada: null,
      cancelada: false,
    },
  };
}

function lerCte(cte: unknown): ResultadoLeitura {
  const inf = filho(cte, "infCte");
  if (inf === undefined) return recusa("campo_obrigatorio_ausente", "infCte ausente");

  const chave = chaveDoId(inf);
  if (!chave) return recusa("chave_ausente", "atributo Id de infCte sem 44 dígitos");
  if (!chaveDeAcessoValida(chave)) return recusa("chave_invalida", `dígito verificador não confere: ${chave}`);

  const ide = filho(inf, "ide");
  const numero = texto(filho(ide, "nCT"));
  const serie = texto(filho(ide, "serie"));
  const emitidoEm = dataDeEmissao(ide);
  if (!numero) return recusa("campo_obrigatorio_ausente", "ide/nCT ausente");
  if (!emitidoEm) return recusa("campo_obrigatorio_ausente", "ide/dhEmi ausente ou inválida");

  const valorTotal = texto(caminho(inf, "vPrest", "vTPrest"));
  if (!valorTotal) return recusa("campo_obrigatorio_ausente", "vPrest/vTPrest ausente");

  // No CT-e o par que importa para o financeiro é emitente (transportadora) e
  // **tomador** do serviço. `dest` existe e é o destinatário da carga, que
  // frequentemente não é quem paga — usar ele penduraria o frete na empresa
  // errada. O tomador vem em `toma3/toma` como código; quando o XML traz o
  // bloco `toma4`, os dados estão lá direto.
  const tomador = filho(inf, "toma4") ?? filho(filho(inf, "toma3"), "toma4");

  return {
    ok: true,
    documento: {
      tipo: "CTE",
      chaveAcesso: chave,
      numero,
      serie: serie ?? "0",
      emitidoEm,
      emitente: parte(filho(inf, "emit")),
      destinatario: tomador !== undefined ? parte(tomador) : parte(filho(inf, "dest")),
      valorTotal,
      competenciaDeclarada: null,
      cancelada: false,
    },
  };
}
