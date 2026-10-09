// Integra Contador do Serpro — regras puras: preço, teto, pedido e resposta.
//
// Fontes no estudo de 09/10/2026 (connect-41/estudos/serpro/serpro-integra.md,
// fora do git; resumo no vault em Projects/Connect-41/Integra-Contador-
// Viabilidade-2026-10-09). O que importa aqui:
// - Pós-pago, por chamada, com faixas de consumo do mês separadas por tipo
//   (Consulta, Emissão, Declaração). Apoiar e Monitorar são de graça.
// - Cobra as respostas 200, 202 e 403 — inclusive o 403 de cliente sem
//   procuração. 204, 304, 4xx (fora o 403), 5xx e o 504 do tempo esgotado, não.
// - A faixa vale para todas as chamadas do mês ("direto na faixa", segundo os
//   fornecedores; a confirmar no contrato). Por isso o custo é do mês, e não
//   de cada linha.

import { formatarReaisDeCentavos } from "@/lib/format";

export const CODIGO_DA_INTEGRACAO = "serpro_integra_contador";

export const CAMINHOS = ["Apoiar", "Consultar", "Declarar", "Emitir", "Monitorar"] as const;
export type Caminho = (typeof CAMINHOS)[number];

export const TIPOS_DE_COBRANCA = ["CONSULTA", "EMISSAO", "DECLARACAO"] as const;
export type TipoDeCobranca = (typeof TIPOS_DE_COBRANCA)[number];

export const ROTULO_DO_TIPO: Record<TipoDeCobranca, string> = {
  CONSULTA: "Consulta",
  EMISSAO: "Emissão",
  DECLARACAO: "Declaração",
};

export function tipoDeCobranca(caminho: Caminho): TipoDeCobranca | null {
  if (caminho === "Consultar") return "CONSULTA";
  if (caminho === "Emitir") return "EMISSAO";
  if (caminho === "Declarar") return "DECLARACAO";
  return null;
}

/** O Serpro cobra esta resposta? */
export function foiCobrada(caminho: Caminho, status: number | null): boolean {
  if (status === null || tipoDeCobranca(caminho) === null) return false;
  return status === 200 || status === 202 || status === 403;
}

// ─── Preço ───────────────────────────────────────────────────────────────────

/** Faixas da Loja do Serpro: até quantas chamadas no mês, e o preço em centavos. */
export const FAIXAS: Record<TipoDeCobranca, readonly { ate: number; centavos: number }[]> = {
  CONSULTA: [
    { ate: 300, centavos: 24 },
    { ate: 1_000, centavos: 21 },
    { ate: 3_000, centavos: 18 },
    { ate: 7_000, centavos: 16 },
    { ate: 15_000, centavos: 14 },
    { ate: 23_000, centavos: 11 },
    { ate: 30_000, centavos: 9 },
    { ate: Infinity, centavos: 6 },
  ],
  EMISSAO: [
    { ate: 500, centavos: 32 },
    { ate: 5_000, centavos: 29 },
    { ate: 10_000, centavos: 26 },
    { ate: 15_000, centavos: 22 },
    { ate: 25_000, centavos: 19 },
    { ate: 35_000, centavos: 16 },
    { ate: 50_000, centavos: 12 },
    { ate: Infinity, centavos: 8 },
  ],
  DECLARACAO: [
    { ate: 100, centavos: 40 },
    { ate: 500, centavos: 36 },
    { ate: 1_000, centavos: 32 },
    { ate: 3_000, centavos: 28 },
    { ate: 5_000, centavos: 24 },
    { ate: 8_000, centavos: 20 },
    { ate: 10_000, centavos: 16 },
    { ate: Infinity, centavos: 12 },
  ],
};

export type ContagemDoMes = Record<TipoDeCobranca, number>;
export const CONTAGEM_VAZIA: ContagemDoMes = { CONSULTA: 0, EMISSAO: 0, DECLARACAO: 0 };

export type CustoDoTipo = { quantidade: number; faixa: number; centavos: number; totalCentavos: number };
export type CustoDoMes = { porTipo: Record<TipoDeCobranca, CustoDoTipo>; totalCentavos: number };

/** Custo estimado do mês: cada tipo inteiro pelo preço da faixa que atingiu. */
export function custoDoMes(contagem: ContagemDoMes): CustoDoMes {
  const porTipo = {} as Record<TipoDeCobranca, CustoDoTipo>;
  let totalCentavos = 0;
  for (const tipo of TIPOS_DE_COBRANCA) {
    const quantidade = Math.max(0, contagem[tipo] ?? 0);
    const i = FAIXAS[tipo].findIndex((f) => quantidade <= f.ate);
    const faixa = FAIXAS[tipo][i];
    const total = quantidade * faixa.centavos;
    porTipo[tipo] = { quantidade, faixa: i + 1, centavos: faixa.centavos, totalCentavos: total };
    totalCentavos += total;
  }
  return { porTipo, totalCentavos };
}

/** Teto mensal digitado em reais ("400", "R$ 1.250,50") → centavos. null = inválido. */
export function lerTeto(texto: string | null | undefined): number | null {
  const limpo = (texto ?? "").replace(/R\$|\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, decimal = ""] = limpo.replace(/\./g, "").split(",");
  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return centavos > 0 ? centavos : null;
}

/**
 * Cabe mais uma chamada deste tipo no teto? Conta a próxima junto com o mês —
 * na faixa cheia, a 301ª consulta muda o preço das 300 de antes.
 */
export function cabeNoTeto(contagem: ContagemDoMes, tipo: TipoDeCobranca, tetoCentavos: number): { cabe: boolean; depois: number } {
  const depois = custoDoMes({ ...contagem, [tipo]: contagem[tipo] + 1 }).totalCentavos;
  return { cabe: depois <= tetoCentavos, depois };
}

export function reais(centavos: number): string {
  return formatarReaisDeCentavos(centavos);
}

// ─── Pedido e resposta ───────────────────────────────────────────────────────

export type Pessoa = { numero: string; tipo: 1 | 2 };

/** CPF (11) é tipo 1, CNPJ (14) é tipo 2. O número vai como texto (CNPJ alfanumérico, desde jul/2026). */
export function pessoa(documento: string): Pessoa {
  const numero = documento.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return { numero, tipo: numero.length === 11 ? 1 : 2 };
}

export type PedidoAoSerpro = {
  caminho: Caminho;
  idSistema: string;
  idServico: string;
  versaoSistema: string;
  /** CNPJ ou CPF do contribuinte. */
  contribuinte: string;
  dados: Record<string, unknown>;
};

export function corpoDoPedido(p: PedidoAoSerpro, contratante: string, autor: string) {
  return {
    contratante: pessoa(contratante),
    autorPedidoDados: pessoa(autor),
    contribuinte: pessoa(p.contribuinte),
    pedidoDados: {
      idSistema: p.idSistema,
      idServico: p.idServico,
      versaoSistema: p.versaoSistema,
      // `dados` vai como TEXTO com o JSON dentro — é assim no Integra Contador.
      dados: JSON.stringify(p.dados),
    },
  };
}

export type Mensagem = { codigo: string; texto: string };
export type RespostaLida = { status: number; mensagens: Mensagem[]; dados: unknown };

/** O corpo da resposta, com `dados` desembrulhado do texto quando é JSON. */
export function lerResposta(status: number, corpo: string): RespostaLida {
  let json: unknown = null;
  try {
    json = corpo ? JSON.parse(corpo) : null;
  } catch {
    json = null;
  }
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const mensagens = Array.isArray(o.mensagens)
    ? o.mensagens
        .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
        .map((m) => ({ codigo: String(m.codigo ?? ""), texto: String(m.texto ?? "") }))
    : [];
  let dados: unknown = o.dados ?? null;
  if (typeof dados === "string") {
    try {
      dados = JSON.parse(dados);
    } catch {
      // Alguns serviços devolvem texto puro (PDF em base64): fica como veio.
    }
  }
  return { status, mensagens, dados };
}

/** Os códigos das mensagens, para o registro da chamada. */
export function codigosDasMensagens(mensagens: Mensagem[]): string | null {
  const t = mensagens.map((m) => m.codigo).filter(Boolean).join(", ");
  return t ? t.slice(0, 500) : null;
}

/** O que dizer à pessoa quando a chamada não deu certo. */
export function explicarErro(status: number | null, mensagens: Mensagem[]): string {
  const codigos = mensagens.map((m) => m.codigo).join(" ");
  if (status === null) return "O Serpro não respondeu. Tente de novo em alguns minutos.";
  if (/ICGERENCIADOR-022/.test(codigos)) return "O escritório não tem autorização de acesso deste cliente na Receita (cobrada pelo Serpro).";
  if (/ICGERENCIADOR-016/.test(codigos)) return "O CNPJ do certificado é diferente do CNPJ que contratou o Serpro.";
  if (status === 401) return "O Serpro recusou as credenciais: confira a Consumer Key, o Consumer Secret e o certificado.";
  if (status === 403) return `Acesso negado pelo Serpro (cobrado)${mensagens[0] ? `: ${mensagens[0].texto}` : "."}`;
  if (status === 404) return mensagens[0]?.texto || "Nada encontrado no Serpro.";
  if (status === 429) return "Limite de chamadas do Serpro atingido. Tente mais tarde.";
  if (status === 504) return "O Serpro demorou demais e cortou a chamada (não cobrada).";
  if (status >= 500) return "O Serpro está fora do ar. Tente de novo mais tarde.";
  return mensagens[0]?.texto || `O Serpro respondeu ${status}.`;
}

// ─── Certificado ─────────────────────────────────────────────────────────────

/**
 * Titular e CNPJ de um e-CNPJ ICP-Brasil, pelo sujeito do certificado: o CN é
 * "NOME EMPRESARIAL:CNPJ". Sem o padrão, procura 14 dígitos no sujeito.
 */
export function lerSujeitoDoCertificado(sujeito: string): { titular: string | null; cnpj: string | null } {
  const cn = /(?:^|\n|,\s*|\/)CN=([^\n,/]+)/.exec(sujeito)?.[1]?.trim() ?? null;
  const doCn = cn ? /^(.*):(\d{14})$/.exec(cn) : null;
  if (doCn) return { titular: doCn[1].trim(), cnpj: doCn[2] };
  const solto = /(?<!\d)\d{14}(?!\d)/.exec(sujeito)?.[0] ?? null;
  return { titular: cn, cnpj: solto };
}

// ─── Procurações (Integra-Procurações, OBTERPROCURACAO41) ─────────────────────

/**
 * A consulta das procurações do cliente para o escritório. Regras do serviço:
 * o outorgado tem de ser o autor do pedido, e o outorgante, o contribuinte —
 * por isso o pedido sai do documento completo da matriz, e não da raiz.
 */
export function pedidoDeProcuracao(cliente: string, escritorio: string): PedidoAoSerpro {
  const outorgante = pessoa(cliente);
  const outorgado = pessoa(escritorio);
  return {
    caminho: "Consultar",
    idSistema: "PROCURACOES",
    idServico: "OBTERPROCURACAO41",
    versaoSistema: "1",
    contribuinte: outorgante.numero,
    dados: {
      outorgante: outorgante.numero,
      tipoOutorgante: String(outorgante.tipo),
      outorgado: outorgado.numero,
      tipoOutorgado: String(outorgado.tipo),
    },
  };
}

export type ResultadoDaConferencia =
  | { tipo: "ativa"; expiraEm: string; sistemas: number }
  | { tipo: "sem_procuracao" }
  | { tipo: "erro"; texto: string };

/**
 * O que a consulta diz da autorização. Ativa = alguma procuração ainda não
 * vencida; a validade é a mais distante. "Não possui procuração ativa" vem como
 * aviso 40400.
 */
export function resultadoDaConferencia(r: RespostaLida, hoje: string): ResultadoDaConferencia {
  const codigos = r.mensagens.map((m) => m.codigo).join(" ");
  if (/PROCURACOES-40400/.test(codigos) || (r.status === 404 && !Array.isArray(r.dados))) return { tipo: "sem_procuracao" };
  if (r.status !== 200) return { tipo: "erro", texto: explicarErro(r.status, r.mensagens) };
  const lista = Array.isArray(r.dados) ? r.dados : [];
  const validas = lista
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {}))
    .map((p) => {
      const d = String(p.dtexpiracao ?? "");
      return {
        expiraEm: /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : null,
        sistemas: Array.isArray(p.sistemas) ? p.sistemas.length : Number(p.nrsistemas ?? 0),
      };
    })
    .filter((p): p is { expiraEm: string; sistemas: number } => !!p.expiraEm && p.expiraEm >= hoje);
  if (validas.length === 0) return { tipo: "sem_procuracao" };
  validas.sort((a, b) => b.expiraEm.localeCompare(a.expiraEm));
  return { tipo: "ativa", expiraEm: validas[0].expiraEm, sistemas: validas.reduce((n, p) => n + p.sistemas, 0) };
}
