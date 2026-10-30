"use server";

// As ações das telas fiscais no modo real (22/10/2026, API-CONNECT §8.2).
//
// Cada uma, nesta ordem: entrada validada; módulo da tela no nível certo
// (`agir` para operar, `gerir` para cadastro e destravar, mais `podeExcluir`
// para apagar decisão); a raiz entre as do alcance da equipe; o recurso entre
// os estabelecimentos que a pessoa vê; e só então o motor, com o ator da
// sessão e a chave de idempotência que o formulário criou ao abrir. O motor
// confere tudo de novo — esta é a primeira porta, não a única.
//
// Nenhuma ação executa geração: ela enfileira, e o agente do motor executa.

import { z } from "zod";
import { prepararEscritaContribuicoes, contextoContabilPermitido } from "@/lib/fiscal/motor/acoes";
import { recursoDeContribuicoes } from "@/lib/contabil/escopoContribuicoes";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import type { ExecucaoDoMotor, ValidacaoDoMotor } from "@/lib/sped/motor";
import { abrirMotor, type MotorDoEscritorio } from "@/lib/fiscal/motor/servidor";
import { chaveSchema, doErro, idSchema, prepararEscrita, raizSchema, recusa, recusado, revalidarFiscal, visiveis, type Preparo, type ResultadoDoMotor } from "@/lib/fiscal/motor/acoes";
import { parametrosExecucaoSchema, geracao } from "@/lib/fiscal/previa/execucao";
import { corpoDeExecucao } from "@/lib/fiscal/previa/doMotor";
import type { AuthContext } from "@/lib/auth/context";

// ─── Execuções ───────────────────────────────────────────────────────────────

const solicitarSchema = z.object({
  raiz: raizSchema,
  estabelecimentoId: idSchema.nullable(),
  parametros: parametrosExecucaoSchema,
  confirmarDuplicado: z.boolean().default(false),
  chave: chaveSchema,
});

export async function solicitarExecucaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<ExecucaoDoMotor>> {
  const e = solicitarSchema.safeParse(entrada);
  if (!e.success) return recusa(e.error.issues[0]?.message ?? "Pedido inválido.");
  const { raiz, parametros, confirmarDuplicado, chave } = e.data;
  const p = await prepararEscrita(raiz, "fiscal_operacao", "agir");
  if (recusado(p)) return p;
  const estabs = await visiveis(p.ctx, raiz);
  // O EFD Contribuições é por raiz e quem assina é a matriz (§3.2).
  const alvo = parametros.modo === "sped_contribuicoes"
    ? estabs.find((x) => x.matriz)
    : estabs.find((x) => x.id === e.data.estabelecimentoId);
  if (!alvo) return recusa(parametros.modo === "sped_contribuicoes" ? "A matriz desta raiz não está entre as empresas que você acessa." : "Escolha um estabelecimento.");
  try {
    const execucao = await p.motor.cliente.criarExecucao(raiz, corpoDeExecucao(parametros, alvo.id, confirmarDuplicado), { ator: p.ator, chave });
    await logAudit({
      tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.execucao.solicitada",
      entityType: "SpedExecucao", entityId: String(execucao.id),
      metadata: { nome: `#${execucao.id} ${parametros.modo}`, raiz, empresaId: alvo.id, acao: parametros.modo, dataIni: execucao.data_ini, dataFim: execucao.data_fim, chave },
    });
    revalidarFiscal();
    return { ok: true, mensagem: geracao(parametros.modo) ? "Geração enviada para a fila do motor. O agente a executa assim que estiver livre." : "Pedido enviado para a fila do motor.", dados: execucao };
  } catch (err) {
    return doErro(err);
  }
}

const porIdSchema = z.object({ empresaContabil: z.string().uuid().optional(), raiz: raizSchema, id: idSchema, chave: chaveSchema.optional() });

async function execucaoVisivel(p: Preparo, raiz: string, id: number, soContribuicoes = false) {
  const execucao = await p.motor.cliente.obterExecucao(raiz, id);
  const estabs = await visiveis(p.ctx, raiz);
  return (!soContribuicoes || recursoDeContribuicoes(execucao)) && execucao.empresa_id !== null && estabs.some((x) => x.id === execucao.empresa_id) ? execucao : null;
}

export async function cancelarExecucaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<ExecucaoDoMotor>> {
  const e = porIdSchema.safeParse(entrada);
  if (!e.success) return recusa("Pedido inválido.");
  const p = await prepararEscritaContribuicoes(e.data.raiz, "fiscal_operacao", "agir", e.data.empresaContabil);
  if (recusado(p)) return p;
  try {
    if (!(await execucaoVisivel(p, e.data.raiz, e.data.id, !!e.data.empresaContabil))) return recusa("Execução não encontrada.");
    const execucao = await p.motor.cliente.cancelarExecucao(e.data.raiz, e.data.id, { ator: p.ator, chave: e.data.chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: e.data.empresaContabil ? "contabil.sped.execucao.cancelada" : "fiscal.sped.execucao.cancelada",
      entityType: "SpedExecucao", entityId: String(e.data.id), metadata: { nome: `#${e.data.id}`, raiz: e.data.raiz } });
    revalidarFiscal();
    return { ok: true, mensagem: "Pedido cancelado.", dados: execucao };
  } catch (err) {
    return doErro(err);
  }
}

/** Destravar libera um item sem sinal do agente; não mata processo (§4.6). Gestão do módulo. */
export async function destravarExecucaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<ExecucaoDoMotor>> {
  const e = porIdSchema.safeParse(entrada);
  if (!e.success) return recusa("Pedido inválido.");
  const p = await prepararEscritaContribuicoes(e.data.raiz, "fiscal_operacao", "gerir", e.data.empresaContabil);
  if (recusado(p)) return p;
  try {
    if (!(await execucaoVisivel(p, e.data.raiz, e.data.id, !!e.data.empresaContabil))) return recusa("Execução não encontrada.");
    const execucao = await p.motor.cliente.destravarExecucao(e.data.raiz, e.data.id, { ator: p.ator, chave: e.data.chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: e.data.empresaContabil ? "contabil.sped.execucao.destravada" : "fiscal.sped.execucao.destravada",
      entityType: "SpedExecucao", entityId: String(e.data.id), metadata: { nome: `#${e.data.id}`, raiz: e.data.raiz } });
    revalidarFiscal();
    return { ok: true, mensagem: "Execução liberada: marcada como erro por falta de sinal do agente.", dados: execucao };
  } catch (err) {
    return doErro(err);
  }
}

/** Leitura para o acompanhamento (polling do log). Só o módulo, em "ver". */
export async function lerExecucaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<{ execucao: ExecucaoDoMotor; log: string; truncado: boolean }>> {
  const e = porIdSchema.safeParse(entrada);
  if (!e.success) return recusa("Pedido inválido.");
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(e.data.empresaContabil ? await contextoContabilPermitido(ctx, e.data.empresaContabil, e.data.raiz) : await podeNoModulo(ctx, "fiscal_operacao", "ver"))) return recusa("Seu perfil não permite esta consulta.");
  const motor = await abrirMotor(ctx.tenantId);
  if (!motor || !motor.raizes.includes(e.data.raiz)) return recusa("Execução não encontrada.");
  try {
    const execucao = await motor.cliente.obterExecucao(e.data.raiz, e.data.id);
    const estabs = await visiveis(ctx, e.data.raiz);
    if ((e.data.empresaContabil && !recursoDeContribuicoes(execucao)) || execucao.empresa_id === null || !estabs.some((x) => x.id === execucao.empresa_id)) return recusa("Execução não encontrada.");
    const log = await motor.cliente.logDaExecucao(e.data.raiz, e.data.id, 200);
    return { ok: true, mensagem: "", dados: { execucao, log: log.texto, truncado: log.truncado } };
  } catch (err) {
    return doErro(err);
  }
}

// ─── Arquivos ────────────────────────────────────────────────────────────────

async function arquivoVisivel(p: { ctx: AuthContext; motor: MotorDoEscritorio }, raiz: string, id: number, soContribuicoes = false) {
  const arquivo = await p.motor.cliente.obterArquivo(raiz, id);
  const estabs = await visiveis(p.ctx, raiz);
  return (!soContribuicoes || recursoDeContribuicoes(arquivo)) && estabs.some((x) => x.cnpj === arquivo.cnpj) ? arquivo : null;
}

const regerarSchema = z.object({ empresaContabil: z.string().uuid().optional(), raiz: raizSchema, id: idSchema, tipoSped: z.enum(["0", "1"]), confirmarDuplicado: z.boolean().default(false), chave: chaveSchema });

export async function regerarArquivoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<ExecucaoDoMotor>> {
  const e = regerarSchema.safeParse(entrada);
  if (!e.success) return recusa("Escolha Original ou Substituto.");
  const p = await prepararEscritaContribuicoes(e.data.raiz, "fiscal_operacao", "agir", e.data.empresaContabil);
  if (recusado(p)) return p;
  try {
    if (!(await arquivoVisivel(p, e.data.raiz, e.data.id, !!e.data.empresaContabil))) return recusa("Arquivo não encontrado.");
    const execucao = await p.motor.cliente.regerarArquivo(e.data.raiz, e.data.id, { tipo_sped: e.data.tipoSped, confirmar_duplicado: e.data.confirmarDuplicado }, { ator: p.ator, chave: e.data.chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: e.data.empresaContabil ? "contabil.sped.arquivo.regerado" : "fiscal.sped.arquivo.regerado",
      entityType: "SpedArquivo", entityId: String(e.data.id), metadata: { nome: `#${e.data.id}`, raiz: e.data.raiz, execucaoId: execucao.id, tipoSped: e.data.tipoSped } });
    revalidarFiscal();
    return { ok: true, mensagem: `Nova geração na fila (pedido #${execucao.id}).`, dados: execucao };
  } catch (err) {
    return doErro(err);
  }
}

export async function validarArquivoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<{ validacaoId: number }>> {
  const e = z.object({ empresaContabil: z.string().uuid().optional(), raiz: raizSchema, id: idSchema, chave: chaveSchema }).safeParse(entrada);
  if (!e.success) return recusa("Pedido inválido.");
  const p = await prepararEscritaContribuicoes(e.data.raiz, "fiscal_entregas", "agir", e.data.empresaContabil);
  if (recusado(p)) return p;
  try {
    if (!(await arquivoVisivel(p, e.data.raiz, e.data.id, !!e.data.empresaContabil))) return recusa("Arquivo não encontrado.");
    const r = await p.motor.cliente.validarArquivo(e.data.raiz, e.data.id, { ator: p.ator, chave: e.data.chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: e.data.empresaContabil ? "contabil.sped.arquivo.validado" : "fiscal.sped.arquivo.validado",
      entityType: "SpedArquivo", entityId: String(e.data.id), metadata: { nome: `#${e.data.id}`, raiz: e.data.raiz, validacaoId: r.validacao_id } });
    return { ok: true, mensagem: "Validação iniciada no motor. O resultado aparece aqui em instantes.", dados: { validacaoId: r.validacao_id } };
  } catch (err) {
    return doErro(err);
  }
}

export async function lerValidacaoNoMotor(entrada: unknown): Promise<ResultadoDoMotor<ValidacaoDoMotor>> {
  const e = z.object({ empresaContabil: z.string().uuid().optional(), raiz: raizSchema, id: idSchema, validacaoId: idSchema.optional() }).safeParse(entrada);
  if (!e.success) return recusa("Pedido inválido.");
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(e.data.empresaContabil ? await contextoContabilPermitido(ctx, e.data.empresaContabil, e.data.raiz) : await podeNoModulo(ctx, "fiscal_entregas", "ver"))) return recusa("Seu perfil não permite esta consulta.");
  const motor = await abrirMotor(ctx.tenantId);
  if (!motor || !motor.raizes.includes(e.data.raiz)) return recusa("Arquivo não encontrado.");
  try {
    if (!(await arquivoVisivel({ ctx, motor }, e.data.raiz, e.data.id, !!e.data.empresaContabil))) return recusa("Arquivo não encontrado.");
    return { ok: true, mensagem: "", dados: await motor.cliente.obterValidacao(e.data.raiz, e.data.id, e.data.validacaoId) };
  } catch (err) {
    return doErro(err);
  }
}

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const entregaSchema = z.object({
  empresaContabil: z.string().uuid().optional(),
  raiz: raizSchema,
  id: idSchema,
  chave: chaveSchema,
  tipo: z.enum(["original", "retificadora"]),
  recibo: z.string().trim().max(60, "O recibo vai até 60 caracteres."),
  dataEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data da entrega."),
  observacao: z.string().trim().max(200, "A observação vai até 200 caracteres."),
}).superRefine((v, c) => {
  if (v.tipo === "retificadora" && !v.recibo) c.addIssue({ code: "custom", path: ["recibo"], message: "Na retificadora, informe o recibo." });
  if (v.dataEntrega > hojeEmSaoPaulo()) c.addIssue({ code: "custom", path: ["dataEntrega"], message: "A data da entrega não pode ser futura." });
});

export async function registrarEntregaNoMotor(entrada: unknown): Promise<ResultadoDoMotor> {
  const e = entregaSchema.safeParse(entrada);
  if (!e.success) return recusa(e.error.issues[0]?.message ?? "Dados da entrega inválidos.");
  const p = await prepararEscritaContribuicoes(e.data.raiz, "fiscal_entregas", "agir", e.data.empresaContabil);
  if (recusado(p)) return p;
  try {
    if (!(await arquivoVisivel(p, e.data.raiz, e.data.id, !!e.data.empresaContabil))) return recusa("Arquivo não encontrado.");
    await p.motor.cliente.registrarEntrega(e.data.raiz, e.data.id, { tipo: e.data.tipo, recibo: e.data.recibo, data_entrega: e.data.dataEntrega, observacao: e.data.observacao }, { ator: p.ator, chave: e.data.chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: e.data.empresaContabil ? "contabil.sped.arquivo.entregue" : "fiscal.sped.arquivo.entregue",
      entityType: "SpedArquivo", entityId: String(e.data.id), metadata: { nome: `#${e.data.id}`, raiz: e.data.raiz, tipo: e.data.tipo, recibo: e.data.recibo, dataEntrega: e.data.dataEntrega } });
    revalidarFiscal();
    return { ok: true, mensagem: "Entrega registrada no motor." };
  } catch (err) {
    return doErro(err);
  }
}

// ─── Cadastro do estabelecimento (§3.3) ─────────────────────────────────────

const CAMPOS_DA_EMPRESA = [
  "razao_social", "nome_fantasia", "cod_ver", "ie", "cod_mun", "ind_perfil", "ind_ativ", "cep", "endereco", "numero", "complemento",
  "bairro", "telefone", "email", "resp_nome", "resp_cpf", "resp_crc", "cod_cta", "cod_inf", "cod_receita_icms", "dia_vcto_icms",
  "codigo_externo", "apelido", "codigo_dominio",
] as const;
export type CampoDaEmpresa = (typeof CAMPOS_DA_EMPRESA)[number];

const empresaSchema = z.object({
  raiz: raizSchema,
  id: idSchema,
  chave: chaveSchema.optional(),
  atualizadoEmEsperado: z.string().nullable(),
  // Parcial: só o que a pessoa mudou. `cnpj`, `uf` e `ativo` não entram (422 no motor).
  campos: z.record(z.string(), z.union([z.string().max(255), z.number().int()])),
});

export async function atualizarEstabelecimentoNoMotor(entrada: unknown): Promise<ResultadoDoMotor> {
  const e = empresaSchema.safeParse(entrada);
  if (!e.success) return recusa("Dados do cadastro inválidos.");
  const desconhecidos = Object.keys(e.data.campos).filter((k) => !(CAMPOS_DA_EMPRESA as readonly string[]).includes(k));
  if (desconhecidos.length) return recusa(`Campo não editável pelo Connect: ${desconhecidos.join(", ")}.`);
  if (Object.keys(e.data.campos).length === 0) return recusa("Nenhuma alteração para gravar.");
  const dia = e.data.campos.dia_vcto_icms;
  if (dia !== undefined && (typeof dia !== "number" || dia < 0 || dia > 31)) return recusa("Dia de vencimento do ICMS entre 0 e 31.");
  const p = await prepararEscrita(e.data.raiz, "fiscal_configuracoes", "gerir");
  if (recusado(p)) return p;
  if (!(await visiveis(p.ctx, e.data.raiz)).some((x) => x.id === e.data.id)) return recusa("Estabelecimento não encontrado.");
  try {
    const corpo = { ...e.data.campos, ...(e.data.atualizadoEmEsperado ? { atualizado_em_esperado: e.data.atualizadoEmEsperado } : {}) };
    const empresa = await p.motor.cliente.atualizarEmpresa(e.data.raiz, e.data.id, corpo, { ator: p.ator, chave: e.data.chave });
    await logAudit({ tenantId: p.ctx.tenantId, userId: p.ctx.userId, action: "fiscal.sped.estabelecimento.editado",
      entityType: "SpedEstabelecimento", entityId: String(e.data.id), metadata: { nome: empresa.rotulo, raiz: e.data.raiz, campos: Object.keys(e.data.campos) } });
    revalidarFiscal();
    return { ok: true, mensagem: "Cadastro atualizado no motor. Os SPEDs já gerados da raiz ficam defasados." };
  } catch (err) {
    return doErro(err);
  }
}

