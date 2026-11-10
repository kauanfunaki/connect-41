// O Gerar SPED pela fila do Connect (06/11/2026).
//
// Até aqui o Connect **empurrava** a revisão para a API do app do motor
// (`/uploads` e `/execucoes` em `/api/connect/v1`). O motor passou a rodar por
// fora, sem esse app: agora o Connect guarda o pedido e o agente do motor vem
// buscar. O pedido congela a revisão (como antes), cria a tarefa `gerar_sped`
// na fila do robô e a geração que acompanha o arquivo — numa transação só.
//
// O lado da máquina está em `geracaoPeloAgente.ts`; o contrato, em
// `docs/SPED-GERACAO-PELO-AGENTE.md`.

import "server-only";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { logAudit } from "@/lib/audit";
import { MODULO_OPS } from "@/lib/ops/regras";
import { ROTULO_DO_STATUS, chaveAberta, type StatusDaTarefa } from "@/lib/robo/tarefas";
import { PREFIXO_DO_AGENTE_SPED, agenteDoSinal, type AgenteNaTela } from "./agente";
import { ErroFiscal, carregarBase, json, montarPacote, prepararTelaLocal } from "./servidor";
import { obrigacaoSchema, type Obrigacao } from "./dominio";
import { cabeNoBanco, ehPacoteGrandeDemais, mensagemDoPacoteGrande, serializarPacote } from "./pacote";

/** O `max_allowed_packet` da conexão, em bytes; `null` se a consulta falhar (aí não barra). */
async function limiteDoBanco(): Promise<number | null> {
  try {
    const [linha] = await getPrisma().$queryRaw<{ limite: bigint | number }[]>`SELECT @@max_allowed_packet AS limite`;
    const limite = Number(linha?.limite);
    return Number.isFinite(limite) && limite > 0 ? limite : null;
  } catch {
    return null;
  }
}
import { montarEscrituracao } from "./escrituracao";
import { faltasDoEstabelecimento, faltasDosDocumentos, mensagemDasFaltas } from "./conferenciaDoArquivo";
import type { PedidoDeGeracao } from "./geracaoPeloAgente";

const pedidoSchema = z.object({ obrigacao: obrigacaoSchema, tipo: z.enum(["0", "1"]), chave: z.string().uuid() });

export const SEM_OPS = "O agente do SPED roda como automação do Orquestrador, e o Orquestrador está desligado neste escritório. Ligue o módulo para gerar pelo Connect.";

/**
 * Uma geração aberta por arquivo: o índice único da fila recusa a segunda. O
 * ICMS/IPI é do estabelecimento; o Contribuições, da raiz — pedir pela matriz
 * ou pela filial é o mesmo arquivo.
 */
const referencia = (obrigacao: Obrigacao, companyId: string, raiz: string, competencia: string) => (obrigacao === "contribuicoes" ? `${raiz}:${competencia}:contribuicoes` : `${companyId}:${competencia}:icms_ipi`);

export async function pedirGeracao(ctx: AuthContext, entrada: { empresa: string; competencia: string; revisao: number; dados: unknown }) {
  const pedido = pedidoSchema.parse(entrada.dados);
  const tela = await prepararTelaLocal({ empresa: entrada.empresa, competencia: entrada.competencia, obrigacao: pedido.obrigacao, escopo: pedido.obrigacao === "contribuicoes" ? "raiz" : "empresa" }, "gerar");
  const c = tela.contexto;
  if (!c || c.companyId !== entrada.empresa) throw new ErroFiscal("A empresa em foco mudou. Confira a empresa antes de gerar.", 409);
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_OPS))) throw new ErroFiscal(SEM_OPS, 409);
  const db = getPrisma();

  // A mesma intenção de novo (duplo clique, resposta perdida): devolve o pedido feito.
  const repetido = await pedidoJaFeito(ctx, pedido.chave, { companyId: c.companyId, competencia: c.competencia, obrigacao: pedido.obrigacao, tipo: pedido.tipo });
  if (repetido) return repetido;

  // O arquivo do Contribuições é da raiz, em nome da matriz; o do ICMS/IPI, do estabelecimento.
  const dono = pedido.obrigacao === "contribuicoes" ? tela.grupo.find((e) => e.cnpj.slice(8, 12) === "0001") : { id: c.companyId, cnpj: c.cnpj };
  if (!dono) throw new ErroFiscal("A matriz precisa estar autorizada no Connect para gerar Contribuições.");

  const base = await carregarBase(tela);
  if (base.revisao !== entrada.revisao) throw new ErroFiscal("Os dados mudaram. Confira a revisão antes de gerar.", 409);
  // O que o arquivo exige além da apuração: o cadastro do estabelecimento e o que só o XML guardado traz.
  const escrituracao = await montarEscrituracao(tela, base, dono.id);
  let pacote: ReturnType<typeof montarPacote>;
  try {
    pacote = montarPacote(tela, base, pedido.obrigacao, pedido.tipo, escrituracao);
  } catch (err) {
    if (ehPacoteGrandeDemais(err)) throw new ErroFiscal(mensagemDoPacoteGrande(base.documentos.length, null));
    throw err;
  }
  // A revisão inteira vai numa coluna JSON, num INSERT só. Acima do `max_allowed_packet`, o MySQL
  // fecha a conexão sem dizer por quê: confere antes, pelo limite do próprio banco.
  if (!cabeNoBanco(pacote.bytes.length, await limiteDoBanco())) throw new ErroFiscal(mensagemDoPacoteGrande(base.documentos.length, pacote.bytes.length));
  // O que o agente recusaria por falta de dado, dito agora e não depois que a máquina pegar
  // a tarefa (06/11/2026). Só o ICMS/IPI: é o que o agente gera hoje (sped_generator#59).
  if (pedido.obrigacao === "icms_ipi") {
    const perfil = base.perfis.find((p) => p.companyId === dono.id);
    const faltas = [...faltasDoEstabelecimento(escrituracao.estabelecimento, perfil?.inscricaoEstadual ?? ""), ...faltasDosDocumentos(base.documentos, escrituracao)];
    if (faltas.length) throw new ErroFiscal(mensagemDasFaltas(faltas));
  }
  try {
    const r = await db.$transaction(async (tx) => {
      const lock = await tx.spedFiscalRoot.updateMany({ where: { tenantId: ctx.tenantId, raiz: c.raiz, revision: base.revisao }, data: { revision: { increment: 0 } } });
      if (!lock.count) throw new ErroFiscal("Os dados mudaram antes de congelar a revisão.", 409);
      const revisao = await tx.spedFiscalRevision.create({ data: { tenantId: ctx.tenantId, companyId: c.companyId, raiz: c.raiz, competence: c.competencia, obligation: pedido.obrigacao, revision: base.revisao, sha256: pacote.sha256, data: json(pacote.pacote), requestKey: pedido.chave, requestedBy: ctx.userId } });
      // O agente refaz os bytes a partir do JSON gravado: se não conferirem já aqui, nada é pedido.
      const relida = await tx.spedFiscalRevision.findUnique({ where: { id: revisao.id }, select: { data: true } });
      if (!relida || serializarPacote(relida.data).sha256 !== pacote.sha256) throw new ErroFiscal("A revisão congelada não confere ao ser relida do banco. Nada foi pedido; tente de novo.", 500);
      const dados: PedidoDeGeracao = { revisao_id: revisao.id, raiz: c.raiz, cnpj: dono.cnpj, competencia: c.competencia, obrigacao: pedido.obrigacao, tipo_sped: pedido.tipo, sha256: pacote.sha256, tamanho: pacote.bytes.length };
      const tarefa = await tx.robotTask.create({ data: { tenantId: ctx.tenantId, kind: "gerar_sped", companyId: dono.id, payload: JSON.stringify(dados), openKey: chaveAberta(ctx.tenantId, "gerar_sped", referencia(pedido.obrigacao, dono.id, c.raiz, c.competencia)), requestedById: ctx.userId } });
      const geracao = await tx.spedFiscalGeneration.create({ data: { tenantId: ctx.tenantId, companyId: dono.id, revisionId: revisao.id, robotTaskId: tarefa.id, raiz: c.raiz, competence: c.competencia, obligation: pedido.obrigacao } });
      return { geracaoId: geracao.id, revisaoId: revisao.id };
    }, { timeout: 30000 });
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fiscal.sped.geracao_pedida", entityType: "SpedFiscalGeneration", entityId: r.geracaoId, metadata: { companyId: c.companyId, competencia: c.competencia, obrigacao: pedido.obrigacao, tipo: pedido.tipo, revisao: base.revisao, sha256: pacote.sha256 } });
    return { ...r, mensagem: "Pedido na fila. O agente do motor gera quando buscar a próxima tarefa; acompanhe abaixo." };
  } catch (err) {
    if (ehPacoteGrandeDemais(err)) throw new ErroFiscal(mensagemDoPacoteGrande(base.documentos.length, pacote.bytes.length));
    if (!isPrismaUniqueError(err)) throw err;
    // Duas abas com a mesma chave: a outra gravou primeiro.
    const outro = await pedidoJaFeito(ctx, pedido.chave, { companyId: c.companyId, competencia: c.competencia, obrigacao: pedido.obrigacao, tipo: pedido.tipo });
    if (outro) return outro;
    throw new ErroFiscal("Já há uma geração aberta para esta empresa, competência e obrigação. Acompanhe abaixo ou cancele a que está na fila antes de pedir outra.", 409);
  }
}

async function pedidoJaFeito(ctx: AuthContext, chave: string, esperado: { companyId: string; competencia: string; obrigacao: Obrigacao; tipo: "0" | "1" }) {
  const db = getPrisma();
  const revisao = await db.spedFiscalRevision.findUnique({ where: { tenantId_requestKey: { tenantId: ctx.tenantId, requestKey: chave } }, select: { id: true, companyId: true, competence: true, obligation: true, data: true } });
  if (!revisao) return null;
  const tipo = (revisao.data as { tipo_sped?: unknown } | null)?.tipo_sped;
  if (revisao.companyId !== esperado.companyId || revisao.competence !== esperado.competencia || revisao.obligation !== esperado.obrigacao || tipo !== esperado.tipo) throw new ErroFiscal("A chave já foi usada para outro pedido.", 409);
  const geracao = await db.spedFiscalGeneration.findUnique({ where: { revisionId: revisao.id }, select: { id: true } });
  // Revisão do envio antigo ao motor, com a mesma chave: não vira pedido novo.
  if (!geracao) throw new ErroFiscal("A chave já foi usada para outro pedido.", 409);
  return { geracaoId: geracao.id, revisaoId: revisao.id, mensagem: "Este pedido já está na fila." };
}

/** As gerações que a tela de uma empresa mostra: o ICMS/IPI dela e o Contribuições da raiz dela. */
const daEmpresa = (empresa: { id: string; cnpj: string }) => [{ companyId: empresa.id, obligation: "icms_ipi" }, { raiz: empresa.cnpj.slice(0, 8), obligation: "contribuicoes" }];

/** Tira da fila uma geração que a máquina ainda não pegou. */
export async function cancelarGeracao(ctx: AuthContext, empresa: { id: string; cnpj: string }, geracaoId: string): Promise<{ mensagem: string }> {
  const db = getPrisma();
  const geracao = await db.spedFiscalGeneration.findFirst({ where: { id: geracaoId, tenantId: ctx.tenantId, OR: daEmpresa(empresa) }, select: { id: true, robotTaskId: true } });
  if (!geracao) throw new ErroFiscal("Geração não encontrada.", 404);
  const r = await db.robotTask.updateMany({
    where: { id: geracao.robotTaskId, tenantId: ctx.tenantId, kind: "gerar_sped", status: "PENDENTE" },
    data: { status: "CANCELADA", openKey: null, finishedAt: new Date(), reason: "Cancelada no Gerar SPED." },
  });
  if (r.count !== 1) throw new ErroFiscal("A geração já saiu da fila: a máquina pegou ou ela terminou.", 409);
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "fiscal.sped.geracao_cancelada", entityType: "SpedFiscalGeneration", entityId: geracao.id });
  return { mensagem: "Geração tirada da fila." };
}

export type GeracaoNaTela = {
  id: string;
  revisao: number;
  obrigacao: Obrigacao;
  tipoSped: "0" | "1";
  estado: StatusDaTarefa;
  rotuloDoEstado: string;
  aberta: boolean;
  maquina: string | null;
  /** Quando a máquina pegou (executando) ou quando foi pedida (na fila). */
  desde: string;
  motivo: string | null;
  tentativas: number;
  arquivo: { nome: string; bytes: number; sha256: string } | null;
  pedidaEm: string;
  concluidaEm: string | null;
};

export type { AgenteNaTela } from "./agente";

const ESTADOS = new Set<string>(Object.keys(ROTULO_DO_STATUS));

/**
 * As gerações da empresa na competência, com o andamento da fila, e o sinal
 * da última máquina que pegou uma geração no escritório — ou, antes da
 * primeira, da automação do agente do SPED (`agenteDoSinal`). Leve: a tela
 * relê isto a cada poucos segundos enquanto há geração aberta.
 */
export async function geracoesDaTela(tenantId: string, empresa: { id: string; cnpj: string }, competencia: string): Promise<{ geracoes: GeracaoNaTela[]; agente: AgenteNaTela | null }> {
  const db = getPrisma();
  const linhas = await db.spedFiscalGeneration.findMany({ where: { tenantId, competence: competencia, OR: daEmpresa(empresa) }, orderBy: { createdAt: "desc" }, take: 20 });
  const [tarefas, revisoes, ultima] = await Promise.all([
    db.robotTask.findMany({ where: { tenantId, id: { in: linhas.map((g) => g.robotTaskId) } }, select: { id: true, status: true, attempts: true, machineSlug: true, claimedAt: true, reason: true, payload: true, createdAt: true } }),
    db.spedFiscalRevision.findMany({ where: { tenantId, id: { in: linhas.map((g) => g.revisionId) } }, select: { id: true, revision: true } }),
    db.robotTask.findFirst({ where: { tenantId, kind: "gerar_sped", machineSlug: { not: null } }, orderBy: { claimedAt: "desc" }, select: { machineSlug: true } }),
  ]);
  const slugs = [...new Set([...tarefas.map((t) => t.machineSlug), ultima?.machineSlug].filter((s): s is string => !!s))];
  // Com as máquinas das tarefas, a automação do agente do SPED: é ela que dá o sinal antes da primeira geração (10/11/2026).
  const maquinas = await db.opsWatcher.findMany({
    where: { tenantId, OR: [...(slugs.length ? [{ slug: { in: slugs } }] : []), { isActive: true, slug: { startsWith: PREFIXO_DO_AGENTE_SPED } }] },
    select: { slug: true, name: true, isActive: true, lastHeartbeatAt: true },
  });
  const porTarefa = new Map(tarefas.map((t) => [t.id, t]));
  const porRevisao = new Map(revisoes.map((r) => [r.id, r.revision]));
  const nomeDaMaquina = (slug: string | null) => (slug ? maquinas.find((m) => m.slug === slug)?.name ?? slug : null);
  const geracoes = linhas.flatMap((g): GeracaoNaTela[] => {
    const t = porTarefa.get(g.robotTaskId);
    if (!t || !ESTADOS.has(t.status)) return [];
    const estado = t.status as StatusDaTarefa;
    const tipo = (() => { try { return (JSON.parse(t.payload) as { tipo_sped?: string }).tipo_sped === "1" ? "1" : "0"; } catch { return "0"; } })();
    return [{
      id: g.id,
      revisao: porRevisao.get(g.revisionId) ?? 0,
      obrigacao: g.obligation === "contribuicoes" ? "contribuicoes" : "icms_ipi",
      tipoSped: tipo,
      estado,
      rotuloDoEstado: ROTULO_DO_STATUS[estado],
      aberta: estado === "PENDENTE" || estado === "EM_EXECUCAO",
      maquina: nomeDaMaquina(t.machineSlug),
      desde: (estado === "EM_EXECUCAO" && t.claimedAt ? t.claimedAt : t.createdAt).toISOString(),
      motivo: t.reason,
      tentativas: t.attempts,
      arquivo: g.filePath && g.fileName && g.fileSha256 && g.fileBytes !== null ? { nome: g.fileName, bytes: g.fileBytes, sha256: g.fileSha256 } : null,
      pedidaEm: g.createdAt.toISOString(),
      concluidaEm: g.finishedAt?.toISOString() ?? null,
    }];
  });
  return { geracoes, agente: agenteDoSinal(ultima?.machineSlug ?? null, maquinas, new Date()) };
}
