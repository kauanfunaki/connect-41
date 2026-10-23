"use server";

// As escritas das telas fiscais pelo Connect (23/10/2026, API-CONNECT §13).
//
// Cada ação, na ordem de `motor-actions.ts`: entrada validada; o módulo da tela
// em `agir`; a raiz no alcance da equipe; o token de escrita; o recurso entre
// os estabelecimentos que a pessoa vê (quando a escrita é de um
// estabelecimento ou de um arquivo); e só então o motor, com o ator da sessão
// e a chave de idempotência do gesto. Depois do sucesso, a auditoria do
// Connect e a releitura só das telas que a escrita mudou.
//
// Os envios de arquivo não estão aqui: passam do limite de corpo das Server
// Actions (10 MB em `next.config.ts`) e vão pela rota
// `/api/fiscal/sped/envios/[destino]`.

import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { ErroDoMotor, type ExecucaoDoMotor } from "@/lib/sped/motor";
import {
  CAMPOS_CORRIGIVEIS, CAMPOS_SIM_NAO_DO_CONTRATO, CAMPOS_TEXTO_DO_CONTRATO, COMPETENCIA, DECISOES_DE_PAGAMENTO, DECISOES_DO_DOCUMENTO, DINHEIRO,
  type CombustivelApurado, type ContratoInformado, type CteApurado, type PagamentoGravado,
} from "@/lib/sped/escritasDoMotor";
import type { DocumentoDaConferencia, PreviaFinanceira, RejeitadoDoMotor } from "@/lib/sped/telasDoMotor";
import { chaveSchema, doErro, idSchema, prepararEscrita, raizSchema, recusa, recusado, revalidarTelas, visiveis, type ResultadoDoMotor } from "@/lib/fiscal/motor/acoes";
import { MODULO } from "@/lib/fiscal/motor/telas/comum";

const DOCUMENTOS = "/fiscal/documentos";
const CONTRIBUICOES = "/fiscal/contribuicoes";
const CONFERENCIA = "/fiscal/conferencia";
const OPERACAO = "/fiscal/operacao";

const competencia = z.string().regex(COMPETENCIA, "Competência inválida (AAAA-MM).");
const primeiraMensagem = (e: z.ZodError, padrao: string) => e.issues[0]?.message ?? padrao;

// ─── Documentos › Cobertura (§13.1) ─────────────────────────────────────────

const coberturaSchema = z.object({
  raiz: raizSchema,
  estabelecimentoId: idSchema,
  competencia,
  confirmarDuplicado: z.boolean().default(false),
  chave: chaveSchema,
});

/** Enfileira a apuração da cobertura (a ação `cobertura` da fila): 202 com a execução, que a fila acompanha. */
export async function apurarCoberturaNoMotor(entrada: unknown): Promise<ResultadoDoMotor<ExecucaoDoMotor>> {
  const e = coberturaSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Pedido inválido."));
  const { raiz, estabelecimentoId, chave } = e.data;
  const p = await prepararEscrita(raiz, MODULO.documentos, "agir");
  if (recusado(p)) return p;
  const alvo = (await visiveis(p.ctx, raiz)).find((x) => x.id === estabelecimentoId);
  if (!alvo) return recusa("Estabelecimento fora das empresas que você acessa.");
  try {
    const execucao = await p.motor.cliente.apurarCobertura(raiz, { empresa_id: alvo.id, competencia: e.data.competencia, confirmar_duplicado: e.data.confirmarDuplicado }, { ator: p.ator, chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.cobertura.apurada",
      entityType: "SpedExecucao", entityId: String(execucao.id), metadata: { nome: `#${execucao.id} cobertura ${e.data.competencia}`, raiz, empresaId: alvo.id, competencia: e.data.competencia, chave } });
    revalidarTelas(DOCUMENTOS, OPERACAO);
    return { ok: true, mensagem: `Apuração da cobertura na fila do motor (pedido #${execucao.id}). Leva alguns minutos; o resultado aparece aqui quando o agente concluir.`, dados: execucao };
  } catch (err) {
    return doErro(err);
  }
}

// ─── Documentos › Importações: quarentena (§13.2) ───────────────────────────

const resolverSchema = z.object({
  raiz: raizSchema,
  id: idSchema,
  resolvido: z.boolean(),
  observacao: z.string().trim().max(255, "A observação vai até 255 caracteres."),
  chave: chaveSchema.optional(),
});

/** Baixa (ou reabre) um rejeitado da quarentena. Baixar não apaga: o XML fica guardado no motor. */
export async function resolverRejeitadoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<RejeitadoDoMotor>> {
  const e = resolverSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Pedido inválido."));
  const { raiz, id, resolvido, observacao, chave } = e.data;
  const p = await prepararEscrita(raiz, MODULO.documentos, "agir");
  if (recusado(p)) return p;
  try {
    const item = await p.motor.cliente.resolverRejeitado(raiz, id, { resolvido, ...(observacao ? { observacao } : {}) }, { ator: p.ator, chave });
    if (resolvido) {
      await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.quarentena.resolvida",
        entityType: "SpedRejeitado", entityId: String(id), metadata: { nome: item.arquivo || `#${id}`, raiz, observacao } });
    } else {
      await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.quarentena.reaberta",
        entityType: "SpedRejeitado", entityId: String(id), metadata: { nome: item.arquivo || `#${id}`, raiz, observacao } });
    }
    revalidarTelas(DOCUMENTOS);
    return { ok: true, mensagem: resolvido ? "Rejeitado resolvido. O XML continua guardado no motor." : "Rejeitado reaberto.", dados: item };
  } catch (err) {
    return doErro(err);
  }
}

// ─── PIS e COFINS › Fechamento: pagamentos (§13.4 e §13.5) ──────────────────

const chaveDoPagamento = {
  caminho: z.string().min(1).max(1000),
  pagina: z.number().int().min(0),
  ordem: z.number().int().min(0),
};

const decidirSchema = z.object({
  raiz: raizSchema,
  ...chaveDoPagamento,
  decisao: z.enum(DECISOES_DE_PAGAMENTO),
  motivo: z.string().trim().max(300, "O motivo vai até 300 caracteres."),
  chave: chaveSchema.optional(),
});

const recursoDoPagamento = (x: { caminho: string; pagina: number; ordem: number }) => `${x.caminho}|${x.pagina}|${x.ordem}`.slice(0, 120);

export async function decidirPagamentoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<PagamentoGravado>> {
  const e = decidirSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Decisão inválida."));
  const { raiz, caminho, pagina, ordem, decisao, motivo, chave } = e.data;
  const p = await prepararEscrita(raiz, MODULO.contribuicoes, "agir");
  if (recusado(p)) return p;
  try {
    const r = await p.motor.cliente.decidirPagamento(raiz, { caminho, pagina, ordem, decisao, ...(motivo ? { motivo } : {}) }, { ator: p.ator, chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.pagamento.decidido",
      entityType: "SpedPagamento", entityId: recursoDoPagamento(e.data), metadata: { nome: recursoDoPagamento(e.data), raiz, decisao, motivo, registroIds: r.registro_ids } });
    revalidarTelas(CONTRIBUICOES);
    return { ok: true, mensagem: decisao === "aceito" ? "Pagamento aceito. Os SPEDs de Contribuições do período ficam defasados." : decisao === "descartado" ? "Pagamento descartado." : "Decisão desfeita: o pagamento volta a conferir.", dados: r };
  } catch (err) {
    return doErro(err);
  }
}

const correcaoSchema = z.object({
  raiz: raizSchema,
  ...chaveDoPagamento,
  // Ausente não mexe; "" limpa a correção (a convenção do painel).
  valor: z.string().trim().refine((v) => v === "" || DINHEIRO.test(v), "Valor inválido: use 1234.56.").optional(),
  documento: z.string().trim().refine((v) => v === "" || /^(\d{11}|\d{14})$/.test(v), "CPF ou CNPJ, só os 11 ou 14 dígitos.").optional(),
  competencia: z.string().trim().refine((v) => v === "" || COMPETENCIA.test(v), "Competência inválida (AAAA-MM).").optional(),
  data_pagamento: z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida (AAAA-MM-DD).").optional(),
  nome: z.string().trim().max(200, "O nome vai até 200 caracteres.").optional(),
  tipo: z.string().trim().max(40).optional(),
  motivo: z.string().trim().max(300, "O motivo vai até 300 caracteres.").default(""),
  decisao: z.enum(DECISOES_DE_PAGAMENTO).optional(),
  chave: chaveSchema.optional(),
});

/**
 * Corrige um pagamento e, opcionalmente, decide junto. Na ordem do painel: a
 * correção grava primeiro, a decisão depois. Se a trava do aceite recusar, **a
 * correção fica** — o motor responde `422 pagamento_nao_aceitavel` com a
 * linha já corrigida —, e a tela tem de dizer as duas coisas: gravou a
 * correção, recusou o aceite.
 */
export async function corrigirPagamentoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<PagamentoGravado>> {
  const e = correcaoSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Correção inválida."), { codigo: "parametro_invalido", campos: Object.fromEntries(e.error.issues.map((i) => [String(i.path[0]), i.message])) });
  const { raiz, caminho, pagina, ordem, motivo, decisao, chave } = e.data;
  const campos = Object.fromEntries(CAMPOS_CORRIGIVEIS.filter((c) => e.data[c] !== undefined).map((c) => [c, e.data[c] as string]));
  if (Object.keys(campos).length === 0) return recusa("Nenhum campo corrigido.");
  const p = await prepararEscrita(raiz, MODULO.contribuicoes, "agir");
  if (recusado(p)) return p;
  const corpo = { caminho, pagina, ordem, ...campos, ...(motivo ? { motivo } : {}), ...(decisao !== undefined ? { decisao } : {}) };
  const auditar = (extra: Record<string, unknown>) => logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.pagamento.corrigido",
    entityType: "SpedPagamento", entityId: recursoDoPagamento(e.data), metadata: { nome: recursoDoPagamento(e.data), raiz, campos: Object.keys(campos), decisao: decisao ?? null, motivo, ...extra } as never });
  try {
    const r = await p.motor.cliente.corrigirPagamento(raiz, corpo, { ator: p.ator, chave });
    await auditar({ registroIds: r.registro_ids });
    revalidarTelas(CONTRIBUICOES);
    return { ok: true, mensagem: decisao === "aceito" ? "Correção gravada e pagamento aceito." : "Correção gravada.", dados: r };
  } catch (err) {
    if (err instanceof ErroDoMotor && err.codigo === "pagamento_nao_aceitavel" && err.corpo.pagamento) {
      // A correção já está gravada no motor: audita e relê a tela mesmo com o 422.
      const registroIds = Array.isArray(err.corpo.registro_ids) ? err.corpo.registro_ids : [];
      await auditar({ registroIds, aceiteRecusado: true });
      revalidarTelas(CONTRIBUICOES);
      return {
        ok: false,
        codigo: err.codigo,
        mensagem: `A correção foi gravada, mas o aceite foi recusado: ${err.message}`,
        detalhe: { correcaoGravada: true, pagamento: err.corpo.pagamento, registro_ids: registroIds },
        renovarChave: true,
      };
    }
    return doErro(err);
  }
}

// ─── PIS e COFINS › Fechamento: aluguéis de imóveis (§13.6) ─────────────────

const simNao = z.enum(["S", "N"]).optional();
const contratoSchema = z.object({
  raiz: raizSchema,
  fornecedor: z.string().trim().min(1, "Informe o fornecedor.").max(255),
  existe_contrato: simNao,
  locataria_bld: simNao,
  e_imovel: simNao,
  aprovado_fora_da_regra: simNao,
  so_contabil: simNao,
  onde_esta: z.string().trim().max(255).optional(),
  locador_nome: z.string().trim().max(255).optional(),
  locador_documento: z.string().trim().refine((v) => v === "" || /^(\d{11}|\d{14})$/.test(v), "Documento do locador: CPF ou CNPJ, só os dígitos.").optional(),
  vigencia_inicio: z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Início da vigência inválido.").optional(),
  vigencia_fim: z.string().trim().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fim da vigência inválido.").optional(),
  observacao: z.string().trim().max(1000).optional(),
  tratativa: z.string().trim().max(1000).optional(),
  chave: chaveSchema.optional(),
}).superRefine((v, c) => {
  if (v.vigencia_inicio && v.vigencia_fim && v.vigencia_fim < v.vigencia_inicio) c.addIssue({ code: "custom", path: ["vigencia_fim"], message: "O fim da vigência vem antes do início." });
  if ((v.aprovado_fora_da_regra === "S" || v.so_contabil === "S") && !v.tratativa) c.addIssue({ code: "custom", path: ["tratativa"], message: "Na ressalva e no “só para o contábil”, escreva a tratativa." });
});

/** O "informar contrato" do painel: grava a resposta e a aplica aos pagamentos a conferir do fornecedor. */
export async function informarContratoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<ContratoInformado>> {
  const e = contratoSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Contrato inválido."), { codigo: "parametro_invalido", campos: Object.fromEntries(e.error.issues.map((i) => [String(i.path[0]), i.message])) });
  const { raiz, fornecedor, chave } = e.data;
  const p = await prepararEscrita(raiz, MODULO.contribuicoes, "agir");
  if (recusado(p)) return p;
  // Só o que a pessoa preencheu: o resto fica com o padrão de `db.gravar_contrato_informado`.
  const corpo = {
    fornecedor,
    ...Object.fromEntries(CAMPOS_SIM_NAO_DO_CONTRATO.filter((k) => e.data[k]).map((k) => [k, e.data[k]])),
    ...Object.fromEntries(CAMPOS_TEXTO_DO_CONTRATO.filter((k) => e.data[k]).map((k) => [k, e.data[k]])),
  };
  try {
    const r = await p.motor.cliente.informarContrato(raiz, corpo, { ator: p.ator, chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.contrato.informado",
      entityType: "SpedContrato", entityId: fornecedor.slice(0, 120), metadata: { nome: fornecedor, raiz, campos: Object.keys(corpo), resultado: { pagamentos: r.resultado.pagamentos, aceitos: r.resultado.aceitos, conferir: r.resultado.conferir }, registroIds: r.registro_ids } });
    revalidarTelas(CONTRIBUICOES);
    const res = r.resultado;
    return { ok: true, mensagem: `Contrato informado. ${res.pagamentos} pagamento(s) do fornecedor: ${res.aceitos} aceito(s), ${res.conferir} a conferir.`, dados: r };
  } catch (err) {
    return doErro(err);
  }
}

// ─── Apurar CT-e de um arquivo (§13.7) ──────────────────────────────────────

const TELAS_DO_CTE = { contribuicoes: { modulo: MODULO.contribuicoes }, conferencia: { modulo: MODULO.conferencia } } as const;
const cteSchema = z.object({ raiz: raizSchema, id: idSchema, tela: z.enum(["contribuicoes", "conferencia"]), chave: chaveSchema.optional() });

/**
 * Lê o SPED gerado uma vez e grava o total e a quebra do CT-e. Pesada: um
 * arquivo por chamada, o laço sobre os pendentes fica na tela. Relê as duas
 * telas que usam o valor (Fechamento e Prévia financeira).
 */
export async function apurarCteNoMotor(entrada: unknown): Promise<ResultadoDoMotor<CteApurado>> {
  const e = cteSchema.safeParse(entrada);
  if (!e.success) return recusa("Pedido inválido.");
  const { raiz, id, chave } = e.data;
  const p = await prepararEscrita(raiz, TELAS_DO_CTE[e.data.tela].modulo, "agir");
  if (recusado(p)) return p;
  try {
    const arquivo = await p.motor.cliente.obterArquivo(raiz, id);
    if (!(await visiveis(p.ctx, raiz)).some((x) => x.cnpj === arquivo.cnpj)) return recusa("Arquivo não encontrado.");
    if (arquivo.obrigacao !== "icms_ipi") return recusa("O CT-e é apurado no SPED de ICMS/IPI; este arquivo é de outra obrigação.", { codigo: "obrigacao_incompativel" });
    const r = await p.motor.cliente.apurarCteDoArquivo(raiz, id, { ator: p.ator, chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.cte.apurado",
      entityType: "SpedArquivo", entityId: String(id), metadata: { nome: `#${id}`, raiz, competencia: arquivo.competencia, qtdCte: r.qtd_cte, valorTotal: r.valor_total, series: r.series } });
    revalidarTelas(CONTRIBUICOES, CONFERENCIA);
    return { ok: true, mensagem: `CT-e do arquivo #${id} apurado: ${r.qtd_cte} CT-e.`, dados: r };
  } catch (err) {
    return doErro(err);
  }
}

// ─── Conferência › Prévia financeira (§13.8 e §13.9) ────────────────────────

const simulacaoSchema = z.object({
  raiz: raizSchema,
  competencia,
  linha: z.string().regex(/^[a-z_]{1,40}$/, "Linha inválida."),
  // `null` apaga a linha: "ninguém disse ainda" não é zero.
  valor: z.string().trim().refine((v) => DINHEIRO.test(v), "Valor inválido: use 1234.56.").nullable(),
  observacao: z.string().trim().max(300, "A observação vai até 300 caracteres.").default(""),
  chave: chaveSchema.optional(),
});

/** Grava (ou apaga, com valor `null`) uma linha simulada da prévia; devolve a prévia inteira recalculada. */
export async function gravarSimulacaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<PreviaFinanceira>> {
  const e = simulacaoSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Simulação inválida."));
  const { raiz, linha, valor, observacao, chave } = e.data;
  const p = await prepararEscrita(raiz, MODULO.conferencia, "agir");
  if (recusado(p)) return p;
  try {
    const previa = await p.motor.cliente.gravarSimulacao(raiz, { competencia: e.data.competencia, linha, valor, ...(observacao ? { observacao } : {}) }, { ator: p.ator, chave });
    if (valor === null) {
      await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.simulacao.apagada",
        entityType: "SpedSimulacao", entityId: `${e.data.competencia}|${linha}`, metadata: { nome: `${linha} de ${e.data.competencia}`, raiz } });
    } else {
      await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.simulacao.gravada",
        entityType: "SpedSimulacao", entityId: `${e.data.competencia}|${linha}`, metadata: { nome: `${linha} de ${e.data.competencia}`, raiz, valor, observacao } });
    }
    revalidarTelas(CONFERENCIA);
    return { ok: true, mensagem: valor === null ? "Simulação apagada: a linha volta a “não levantado”." : "Simulação gravada; a prévia foi recalculada.", dados: previa };
  } catch (err) {
    return doErro(err);
  }
}

const combustivelSchema = z.object({ raiz: raizSchema, estabelecimentoId: idSchema, competencia, chave: chaveSchema.optional() });

/** Soma o combustível das NF-e de entrada de uma filial na competência. Pesada; o laço pelas filiais fica na tela. */
export async function apurarCombustivelNoMotor(entrada: unknown): Promise<ResultadoDoMotor<CombustivelApurado>> {
  const e = combustivelSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Pedido inválido."));
  const { raiz, estabelecimentoId, chave } = e.data;
  const p = await prepararEscrita(raiz, MODULO.conferencia, "agir");
  if (recusado(p)) return p;
  const alvo = (await visiveis(p.ctx, raiz)).find((x) => x.id === estabelecimentoId);
  if (!alvo) return recusa("Estabelecimento fora das empresas que você acessa.");
  try {
    const r = await p.motor.cliente.apurarCombustivel(raiz, { empresa_id: alvo.id, competencia: e.data.competencia }, { ator: p.ator, chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.combustivel.apurado",
      entityType: "SpedCombustivel", entityId: `${alvo.id}|${e.data.competencia}`, metadata: { nome: `${alvo.companyNome} · ${e.data.competencia}`, raiz, empresaId: alvo.id, competencia: e.data.competencia, valorAmbos: r.valor_ambos, notasLidas: r.notas_lidas, notasFalhadas: r.notas_falhadas } });
    revalidarTelas(CONFERENCIA);
    return { ok: true, mensagem: `Combustível de ${alvo.companyNome} apurado: ${r.notas_lidas} nota(s) lida(s).`, dados: r };
  } catch (err) {
    return doErro(err);
  }
}

// ─── Conferência › Confronto: decidir documento do Omie (§13.10) ────────────

const decidirDocumentoSchema = z.object({
  raiz: raizSchema,
  id: idSchema,
  decisao: z.enum(DECISOES_DO_DOCUMENTO),
  observacao: z.string().trim().max(300, "A observação vai até 300 caracteres.").default(""),
  chaveDaNota: z.string().trim().refine((v) => v === "" || /^\d{44}$/.test(v), "A chave da nota tem 44 dígitos.").default(""),
  chave: chaveSchema.optional(),
});

export async function decidirDocumentoDaConferenciaNoMotor(entrada: unknown): Promise<ResultadoDoMotor<DocumentoDaConferencia>> {
  const e = decidirDocumentoSchema.safeParse(entrada);
  if (!e.success) return recusa(primeiraMensagem(e.error, "Decisão inválida."));
  const { raiz, id, decisao, observacao, chaveDaNota, chave } = e.data;
  const p = await prepararEscrita(raiz, MODULO.conferencia, "agir");
  if (recusado(p)) return p;
  try {
    const item = await p.motor.cliente.decidirDocumentoDaConferencia(raiz, id, { decisao, observacao, ...(chaveDaNota ? { chave: chaveDaNota } : {}) }, { ator: p.ator, chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.conferencia.decidida",
      entityType: "SpedConferenciaDocumento", entityId: String(id), metadata: { nome: `${item.numero || `#${id}`} · ${item.fornecedor}`, raiz, decisao, observacao, chaveDaNota: chaveDaNota || null } });
    revalidarTelas(CONFERENCIA);
    return { ok: true, mensagem: decisao ? "Decisão gravada." : "Decisão desfeita.", dados: item };
  } catch (err) {
    return doErro(err);
  }
}
