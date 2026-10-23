// Do JSON do motor SPED para o modelo da prévia (API-CONNECT §8.3, 22/10/2026).
//
// Adaptador puro: as telas reais reaproveitam os rótulos e os tipos da prévia
// (`ExecucaoTeste`, `ArquivoTeste`...) sem que o `cenarioSchema` de teste mude.
// O que o motor não tem **fica de fora**, e a tela esconde o campo — nunca um
// número inventado ao lado de um real (resumo, tentativaDe, documentos).

import type { ArquivoDoMotor, CorpoDeExecucao, DecisaoDoMotor, EmpresaDoMotor, ExecucaoDoMotor, ValidacaoDoMotor } from "@/lib/sped/motor";
import type { AvaliacaoDaCobertura, ImportacaoDoMotor, ItemDoConfronto, PreviaFinanceira } from "@/lib/sped/telasDoMotor";
import type { ArquivoTeste, Cenario, ExecucaoTeste } from "./cenario";
import { geracao, mesInteiro, type ParametrosExecucao } from "./execucao";

const MODOS = ["paralela", "simples", "erros", "sped", "sped_contribuicoes"] as const;
type Modo = (typeof MODOS)[number];
const ehModo = (v: string): v is Modo => (MODOS as readonly string[]).includes(v);

export const ESTADO_DA_EXECUCAO: Record<ExecucaoDoMotor["estado"], ExecucaoTeste["estado"]> = {
  pendente: "Na fila", executando: "Executando", concluida: "Concluída", erro: "Erro", cancelada: "Cancelada",
};

const bool = (v: unknown) => v === true;
const inteiro = (v: unknown, padrao: number) => (typeof v === "number" && Number.isInteger(v) ? v : padrao);

/** A execução do motor no modelo da prévia. `log` vem à parte, só no detalhe. */
export function execucaoDoMotor(e: ExecucaoDoMotor, empresaId: string, log: string[] = []): ExecucaoTeste {
  const p = e.parametros;
  const etapas = Array.isArray(p.step_types) ? p.step_types.filter((s): s is "first_mile" | "last_mile" => s === "first_mile" || s === "last_mile") : [];
  const parametros: ParametrosExecucao | undefined = ehModo(e.acao) ? {
    modo: e.acao,
    dataIni: e.data_ini,
    dataFim: e.data_fim,
    solicitante: e.solicitado_por ?? "",
    etapas,
    semEntradas: bool(p.sem_entradas),
    instancias: inteiro(p.instancias, 1),
    workers: inteiro(p.workers, 1),
    ...(geracao(e.acao) ? { tipoSped: bool(p.retificadora) ? "1" as const : "0" as const } : {}),
    saida: typeof p.saida === "string" ? p.saida : "",
    forcarErros: bool(p.forcar_com_erros),
    forcarCobertura: bool(p.forcar_cobertura),
  } : undefined;
  return {
    id: String(e.id),
    contexto: { empresaId, estabelecimentoId: e.empresa_id === null ? "" : String(e.empresa_id), competencia: e.competencia ?? e.data_ini.slice(0, 7) },
    acao: e.acao,
    estado: ESTADO_DA_EXECUCAO[e.estado],
    criadoEm: e.solicitado_em ?? e.iniciado_em ?? "",
    log,
    ...(parametros ? { parametros } : {}),
    ...(e.iniciado_em ? { iniciadoEm: e.iniciado_em } : {}),
    ...(e.concluido_em ? { concluidoEm: e.concluido_em } : {}),
    arquivoIds: e.arquivo_ids.map(String),
  };
}

/** Situação da validação no rótulo da prévia (§8.3). */
export function validacaoDoArquivo(v: ArquivoDoMotor["validacao"]): ArquivoTeste["validacao"] {
  if (v.estado === "ok" && !v.erros) return "Aprovado";
  if (v.estado === "ok" || v.estado === "erro") return "Com pendências";
  return "Não validado";
}

/** O arquivo do motor no modelo da prévia. `erros` só no detalhe, da rodada de validação. */
export function arquivoDoMotor(a: ArquivoDoMotor, empresaId: string, erros: string[] = []): ArquivoTeste {
  return {
    id: String(a.id),
    contexto: { empresaId, estabelecimentoId: a.empresa_id === null ? "" : String(a.empresa_id), competencia: a.competencia },
    tipo: a.obrigacao === "icms_ipi" ? "ICMS/IPI" : "Contribuições",
    versao: a.versao,
    nome: a.nome_arquivo,
    revisao: String(a.decisao_ate ?? ""),
    criadoEm: a.gerado_em,
    validacao: validacaoDoArquivo(a.validacao),
    erros,
    entregue: a.entrega.estado === "registrada",
    protocolo: a.entrega.recibo ?? "",
    dominio: a.entrega.estado === "dominio",
    ...(a.retificadora === null ? {} : { tipoSped: a.retificadora ? "1" as const : "0" as const }),
    ...(a.execucao_id ? { execucaoId: String(a.execucao_id) } : {}),
  };
}

/**
 * A situação que a lista mostra. Com dado real, **`defasado` substitui o
 * `precisaRevisar`** da prévia; quando o motor só estima (legado), o selo diz.
 */
export function situacaoDoArquivo(a: ArquivoDoMotor): string {
  if (a.defasado) return a.defasado_fonte === "legado" ? "Revisão necessária (estimativa)" : "Revisão necessária";
  if (a.entrega.estado === "registrada") return "Entregue";
  if (a.validacao.estado === "validando") return "Validando";
  return validacaoDoArquivo(a.validacao);
}

/**
 * As mensagens de erro de uma rodada de validação, até 20 (§8.3). O motor
 * devolve os `achados` como `db.buscar_validacao`; a severidade e o texto são
 * lidos pelos nomes mais prováveis, e achado sem texto não vira linha vazia.
 */
export function errosDaValidacao(v: ValidacaoDoMotor, limite = 20): string[] {
  const saida: string[] = [];
  for (const a of v.achados) {
    const severidade = String(a.severidade ?? a.nivel ?? a.tipo ?? "").toLowerCase();
    if (!severidade.startsWith("erro") && severidade !== "e") continue;
    const texto = [a.mensagem, a.descricao, a.texto].find((t): t is string => typeof t === "string" && t.trim() !== "");
    if (!texto) continue;
    const onde = typeof a.registro === "string" && a.registro ? `${a.registro}${a.linha ? ` (linha ${a.linha})` : ""}: ` : "";
    saida.push(`${onde}${texto}`);
    if (saida.length >= limite) break;
  }
  return saida;
}

export type CompanyDoConnect = { id: string; nome: string; cnpj: string; regime: string | null };

/** A empresa da prévia: nome e regime da `Company`; estabelecimentos do motor (§8.3). */
export function empresaDoMotor(company: CompanyDoConnect, estabelecimentos: EmpresaDoMotor[]): Cenario["empresas"][number] {
  return {
    id: company.id,
    nome: company.nome,
    regime: company.regime ?? "—",
    estabelecimentos: estabelecimentos.map((e) => ({ id: String(e.id), nome: e.rotulo, uf: e.uf, cnpj: e.cnpj })),
  };
}

/** Um ajuste do motor no modelo da prévia — o valor vira número só para exibir. */
export function ajusteDoMotor(tipo: "ajuste_apuracao" | "ajuste_contribuicoes", d: DecisaoDoMotor, empresaId: string): Cenario["ajustes"][number] {
  const v = d.valor;
  const s = (x: unknown) => (typeof x === "string" ? x : x === null || x === undefined ? "" : String(x));
  const icms = tipo === "ajuste_apuracao";
  const natureza = s(d.natureza ?? v.natureza);
  return {
    id: s(d.chave.id),
    contexto: { empresaId, estabelecimentoId: s(v.cnpj_empresa), competencia: s(v.competencia) },
    imposto: icms ? "ICMS/IPI" : "Contribuições",
    codigo: icms ? s(v.codigo) : s(v.cod_aj),
    descricao: s(v.descricao),
    valor: Number(s(v.valor)) || 0,
    efeito: icms ? (natureza === "debito" ? "Débito" : "Crédito") : (s(v.operacao) === "credito" ? "Crédito" : "Débito"),
    obrigacao: icms ? "EFD ICMS/IPI" : "EFD Contribuições",
  };
}

/**
 * O sentido contrário: os parâmetros da prévia no corpo de `POST /execucoes`.
 *
 * Só vai o que se aplica à ação, porque o motor recusa chave desconhecida e
 * `execucoes_fila.validar` ignora o resto. O `solicitante` não vai: quem pede
 * é o ator da sessão. Período de mês inteiro vai como `competencia`.
 */
export function corpoDeExecucao(p: ParametrosExecucao, empresaId: number, confirmarDuplicado = false): CorpoDeExecucao {
  const [ini, fim] = mesInteiro(p.dataIni.slice(0, 7));
  const mesFechado = p.dataIni === ini && p.dataFim === fim;
  const periodo = mesFechado ? { competencia: p.dataIni.slice(0, 7) } : { data_ini: p.dataIni, data_fim: p.dataFim };
  let parametros: Record<string, unknown>;
  if (p.modo === "sped") parametros = { saida: p.saida, forcar_com_erros: p.forcarErros, forcar_cobertura: p.forcarCobertura };
  else if (p.modo === "sped_contribuicoes") parametros = {};
  else parametros = {
    ...(p.modo === "paralela" ? { instancias: p.instancias } : {}),
    workers: p.workers,
    step_types: p.etapas,
    sem_entradas: p.semEntradas,
  };
  return {
    acao: p.modo,
    empresa_id: empresaId,
    ...periodo,
    ...(geracao(p.modo) ? { tipo_sped: p.tipoSped ?? "0" } : {}),
    parametros,
    confirmar_duplicado: confirmarDuplicado,
  };
}

/** Totais do detalhe do arquivo, achatados para uma tabela "campo → valor" com os nomes do motor. */
export function linhasDosTotais(totais: Record<string, unknown> | null): { campo: string; valor: string }[] {
  if (!totais) return [];
  const saida: { campo: string; valor: string }[] = [];
  const andar = (prefixo: string, v: unknown, fundo: number) => {
    if (v && typeof v === "object" && !Array.isArray(v) && fundo < 3) {
      for (const [k, filho] of Object.entries(v)) andar(prefixo ? `${prefixo} · ${k}` : k, filho, fundo + 1);
    } else if (v !== null && v !== undefined && typeof v !== "object") {
      saida.push({ campo: prefixo, valor: String(v) });
    }
  };
  andar("", totais, 0);
  return saida.slice(0, 200);
}

// ─── Leituras das telas fiscais (§11, 23/10/2026) ───────────────────────────

/**
 * String decimal do motor em número, **só para exibir ou ordenar**. `null`
 * (não levantado) continua `null` — nunca 0 (§11.0.3).
 */
export function numeroDoMotor(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor.trim() === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** A importação do motor no modelo da prévia (§11.1.1). É da raiz: sem estabelecimento. */
export function importacaoDoMotor(i: ImportacaoDoMotor, empresaId: string, competencia: string): Cenario["importacoes"][number] {
  return {
    id: String(i.id),
    contexto: { empresaId, estabelecimentoId: "", competencia },
    criadoEm: i.iniciado_em ?? "",
    aceitos: i.gravados_cte + i.gravados_nfe,
    rejeitados: i.rejeitados,
    origem: i.origem,
  };
}

/** A importação aparece na competência quando `por_competencia` tem essa chave. */
export function importacaoNaCompetencia(i: ImportacaoDoMotor, competencia: string): boolean {
  return Object.prototype.hasOwnProperty.call(i.por_competencia, competencia);
}

export const ESTADO_DO_CONFRONTO: Record<string, Cenario["confrontos"][number]["estado"]> = {
  sem_nota: "Sem nota", achado: "Conciliado", com_nota: "Conciliado",
};

/**
 * O pagamento do confronto no modelo da prévia (§11.4.4). `possivel_duplicidade`
 * não tem equivalente no `cenario` e devolve `null`: a tela real mostra o selo
 * próprio (`seloDoConfronto`). `documentoId` não tem fonte (só `numero_nota`).
 */
export function confrontoDoMotor(c: ItemDoConfronto, empresaId: string): Cenario["confrontos"][number] | null {
  const estado = ESTADO_DO_CONFRONTO[c.situacao];
  if (!estado) return null;
  return { id: String(c.id), contexto: { empresaId, estabelecimentoId: "", competencia: c.competencia }, documentoId: "", estado, valor: numeroDoMotor(c.valor) ?? 0 };
}

/** O selo da situação do confronto. O rótulo do motor (`rotulos`) vence quando veio. */
export function seloDoConfronto(situacao: string, rotulos: Record<string, string> | null = null): { rotulo: string; tom: "sucesso" | "atencao" | "perigo" | "neutro" } {
  if (situacao === "possivel_duplicidade") return { rotulo: rotulos?.[situacao] ?? "Possível duplicidade", tom: "perigo" };
  const estado = ESTADO_DO_CONFRONTO[situacao];
  if (estado === "Sem nota") return { rotulo: rotulos?.[situacao] ?? estado, tom: "atencao" };
  if (estado === "Conciliado") return { rotulo: rotulos?.[situacao] ?? estado, tom: "sucesso" };
  return { rotulo: rotulos?.[situacao] ?? situacao, tom: "neutro" };
}

/**
 * As alíquotas da prévia financeira no `cenario.parametros` (§11.4.2): só
 * PIS+COFINS têm correspondência, e combinados. `icms` e `ipi` não têm fonte.
 */
export function aliquotasDaPrevia(p: Pick<PreviaFinanceira, "aliquotas">): { pisCofinsCheia: number | null; pisCofinsPresumida: number | null } {
  return { pisCofinsCheia: numeroDoMotor(p.aliquotas.cheia), pisCofinsPresumida: numeroDoMotor(p.aliquotas.presumida) };
}

/** O semáforo da cobertura no tom do `Selo`. */
export function tomDoSemaforo(s: AvaliacaoDaCobertura["semaforo"] | null | undefined): "sucesso" | "atencao" | "perigo" | "neutro" {
  return s === "verde" ? "sucesso" : s === "amarelo" ? "atencao" : s === "vermelho" ? "perigo" : "neutro";
}

const TIPO_DO_ACERVO = { NFE: "NF-e", NFCE: "NFC-e", CTE: "CT-e", NFSE: "NFS-e" } as const;
export type LinhaDoAcervoNoMotor = {
  id: string;
  numero: string;
  tipo: (typeof TIPO_DO_ACERVO)[keyof typeof TIPO_DO_ACERVO];
  /** `null` = indefinido: a linha fica fora do filtro de sentido e ganha selo próprio. */
  sentido: "Entrada" | "Saída" | null;
  participante: string;
  /** `null` na linha `parcial` do índice: "—", nunca 0. */
  valor: number | null;
  xml: boolean;
  emitidoEm: Date;
};

/**
 * Uma linha da projeção `FiscalDocument` no modelo de documento da prévia
 * (§11.1, aba Acervo). O sentido sai do CNPJ do estabelecimento contra as duas
 * pontas — a projeção não guarda o `sentido` do índice, e é assim que o acervo
 * já decide a direção do lançamento. Ficam de fora, sem fonte por documento:
 * `cfop`, `ncm`, `cst`, `destino`, `credito`, `estado`, `motivo`.
 */
export function documentoDoAcervo(
  d: { id: string; type: keyof typeof TIPO_DO_ACERVO; number: string; issuerName: string; issuerDocument: string; recipientName: string | null; recipientDocument: string | null; amount: { toString(): string } | number | null; renderizavel: boolean; issuedAt: Date },
  cnpjDoEstabelecimento: string,
): LinhaDoAcervoNoMotor {
  const cnpj = cnpjDoEstabelecimento.replace(/\D/g, "");
  const emitente = d.issuerDocument.replace(/\D/g, "") === cnpj;
  const destinatario = (d.recipientDocument ?? "").replace(/\D/g, "") === cnpj;
  const sentido = emitente && !destinatario ? "Saída" : destinatario && !emitente ? "Entrada" : null;
  const participante = sentido === "Saída" ? d.recipientName ?? "—" : d.issuerName;
  return {
    id: d.id,
    numero: d.number,
    tipo: TIPO_DO_ACERVO[d.type],
    sentido,
    participante: participante || "—",
    valor: d.amount === null ? null : numeroDoMotor(String(d.amount)),
    xml: d.renderizavel,
    emitidoEm: d.issuedAt,
  };
}

/**
 * As colunas de uma lista sem forma fixa no contrato (pagamentos a conferir,
 * aluguéis, prestadores): as candidatas que existem em ao menos uma linha, na
 * ordem dada, e depois as outras. Coluna sem fonte no motor não aparece.
 */
export function colunasPresentes(linhas: Record<string, unknown>[], candidatas: readonly string[] = [], limite = 12): string[] {
  const presentes = new Set<string>();
  for (const l of linhas) for (const [k, v] of Object.entries(l)) if (v !== undefined) presentes.add(k);
  const ordem = [...candidatas.filter((c) => presentes.has(c)), ...[...presentes].filter((k) => !candidatas.includes(k))];
  return ordem.slice(0, limite);
}
