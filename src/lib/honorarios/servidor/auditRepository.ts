// Acesso ao banco da auditoria — base comum (tabelas hon_*).
//
// Mesmas funções e mesmo formato de linha (snake_case) do repositório do
// Aditiva Pronto, agora pelo Prisma e presas ao escritório da chamada
// (`tenantAtual`): os serviços copiados de lá chamam estas funções sem mudança.
//
// Diferenças de banco, todas por falta de recurso no Prisma:
// - "um job ativo por vez" era uma coluna gerada com índice único; aqui é
//   `ativoTenantId`, que o próprio código liga e desliga com o status;
// - o nome da pasta era comparado com collation binária; aqui pelo SHA-256 do
//   nome exato (`nomePastaHash`).

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { normalizarNomePasta, REGEX_SUBPASTA_CONTRATO_PADRAO } from "../regras/auditNormalizacao";
import type { Lote } from "../regras/auditPayload";
import { db, tenantAtual } from "./contexto";

// ── Tipos ─────────────────────────────────────────────────────────

export type JobStatus = "pendente" | "executando" | "concluido" | "erro";
export type JobOrigem = "manual" | "agendado";
export type TipoVinculo = "auto" | "confirmado" | "ignorado";

export interface AuditConfig {
  raizUnc: string;
  pastaInicial: string;
  pastaFinal: string;
  regexSubpastaContrato: string;
  horarioAgendado: string | null;
}

/**
 * Padrão de um escritório novo. A pasta da rede e o intervalo de pastas de
 * cada escritório vêm da carga dos dados do Aditiva Pronto (fase 3) ou da
 * configuração da tela; ficam fora do código porque o repositório é público.
 */
export const CONFIG_PADRAO: AuditConfig = {
  raizUnc: "",
  pastaInicial: "",
  pastaFinal: "",
  regexSubpastaContrato: REGEX_SUBPASTA_CONTRATO_PADRAO,
  horarioAgendado: "06:00",
};

export interface JobRow {
  id: string;
  status: JobStatus;
  origem: JobOrigem;
  solicitado_em: Date;
  iniciado_em: Date | null;
  ultimo_lote_em: Date | null;
  concluido_em: Date | null;
  robo_host: string | null;
  pastas_total: number | null;
  pastas_recebidas: number;
  arquivos_recebidos: number;
  erro: string | null;
}

export interface HeartbeatRow {
  host: string;
  versao: string | null;
  visto_em: Date;
}

export interface PastaDoJobRow {
  nome_pasta: string;
  subpastas_contrato: string[];
  erro: string | null;
  arquivos: number;
}

export interface VinculoRow {
  nome_pasta: string;
  company_id: string | null;
  tipo: TipoVinculo;
}

export interface EmpresaRow {
  id: string;
  razao_social: string;
  cnpj: string;
  responsavel: string | null;
  inativo: number;
}

export interface MarcaSemPastaRow {
  company_id: string;
  motivo: string | null;
  marcado_em: Date;
}

/** SHA-256 do nome exato da pasta (a unicidade que a collation binária dava no Aditiva). */
export const hashDaPasta = (nomePasta: string) => createHash("sha256").update(nomePasta).digest("hex");

type JobDoBanco = {
  id: string;
  status: string;
  origem: string;
  solicitadoEm: Date;
  iniciadoEm: Date | null;
  ultimoLoteEm: Date | null;
  concluidoEm: Date | null;
  roboHost: string | null;
  pastasTotal: number | null;
  pastasRecebidas: number;
  arquivosRecebidos: number;
  erro: string | null;
};

function paraJobRow(j: JobDoBanco): JobRow {
  return {
    id: j.id,
    status: j.status as JobStatus,
    origem: j.origem as JobOrigem,
    solicitado_em: j.solicitadoEm,
    iniciado_em: j.iniciadoEm,
    ultimo_lote_em: j.ultimoLoteEm,
    concluido_em: j.concluidoEm,
    robo_host: j.roboHost,
    pastas_total: j.pastasTotal,
    pastas_recebidas: j.pastasRecebidas,
    arquivos_recebidos: j.arquivosRecebidos,
    erro: j.erro,
  };
}

// ── Configuração ──────────────────────────────────────────────────

/** Lê a configuração; na primeira vez grava os valores padrão. */
export async function obterConfig(): Promise<AuditConfig> {
  const tenantId = tenantAtual();
  const c = await db().honorarioConfig.upsert({
    where: { tenantId },
    create: { tenantId, ...CONFIG_PADRAO },
    update: {},
  });
  return {
    raizUnc: c.raizUnc,
    pastaInicial: c.pastaInicial,
    pastaFinal: c.pastaFinal,
    regexSubpastaContrato: c.regexSubpastaContrato,
    horarioAgendado: c.horarioAgendado,
  };
}

// ── Jobs ──────────────────────────────────────────────────────────

/** Lança erro com `code: 'ER_DUP_ENTRY'` se já houver um job ativo (como o MySQL no Aditiva). */
export async function inserirJob(id: string, origem: JobOrigem, agora: Date): Promise<void> {
  const tenantId = tenantAtual();
  try {
    await db().honorarioSyncJob.create({
      data: { id, tenantId, status: "pendente", origem, solicitadoEm: agora, ativoTenantId: tenantId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw Object.assign(new Error("Já existe uma sincronização ativa."), { code: "ER_DUP_ENTRY" });
    }
    throw err;
  }
}

async function umJob(where: Prisma.HonorarioSyncJobWhereInput, orderBy?: Prisma.HonorarioSyncJobOrderByWithRelationInput[]) {
  const j = await db().honorarioSyncJob.findFirst({ where: { tenantId: tenantAtual(), ...where }, orderBy });
  return j ? paraJobRow(j) : null;
}

export const buscarJob = (id: string) => umJob({ id });

export const buscarJobAtivo = () => umJob({ status: { in: ["pendente", "executando"] } });

export const buscarJobPendente = () => umJob({ status: "pendente" }, [{ solicitadoEm: "asc" }]);

export const buscarJobExecutandoDoHost = (host: string) => umJob({ status: "executando", roboHost: host });

export const buscarUltimoConcluido = () =>
  umJob({ status: "concluido" }, [{ concluidoEm: "desc" }, { solicitadoEm: "desc" }]);

/** Último job que terminou, com sucesso ou com erro. */
export async function buscarUltimoFinalizado(): Promise<JobRow | null> {
  const jobs = await db().honorarioSyncJob.findMany({
    where: { tenantId: tenantAtual(), status: { in: ["concluido", "erro"] } },
    orderBy: { solicitadoEm: "desc" },
    take: 20,
  });
  // COALESCE(concluido_em, solicitado_em) DESC, solicitado_em DESC — feito aqui.
  const ordenados = jobs.sort(
    (a, b) =>
      (b.concluidoEm ?? b.solicitadoEm).getTime() - (a.concluidoEm ?? a.solicitadoEm).getTime() ||
      b.solicitadoEm.getTime() - a.solicitadoEm.getTime(),
  );
  return ordenados[0] ? paraJobRow(ordenados[0]) : null;
}

export async function buscarUltimaSolicitacao(): Promise<Date | null> {
  const r = await db().honorarioSyncJob.aggregate({ where: { tenantId: tenantAtual() }, _max: { solicitadoEm: true } });
  return r._max.solicitadoEm ?? null;
}

/** Marca o job como "executando" para este robô. false = outro robô pegou antes. */
export async function reivindicarJob(id: string, host: string, agora: Date): Promise<boolean> {
  const r = await db().honorarioSyncJob.updateMany({
    where: { id, tenantId: tenantAtual(), status: "pendente" },
    data: { status: "executando", roboHost: host, iniciadoEm: agora, ultimoLoteEm: agora },
  });
  return r.count === 1;
}

/**
 * Encerra com erro o job que parou de mandar lote (robô caiu no meio) e o
 * pendente esquecido há muito tempo (robô offline por dias).
 */
export async function expirarJobsParados(agora: Date, minutosSemLote = 15, horasPendente = 24): Promise<number> {
  const tenantId = tenantAtual();
  const limiteExecutando = new Date(agora.getTime() - minutosSemLote * 60_000);
  const limitePendente = new Date(agora.getTime() - horasPendente * 3_600_000);
  const executando = await db().honorarioSyncJob.updateMany({
    where: {
      tenantId,
      status: "executando",
      OR: [
        { ultimoLoteEm: { lt: limiteExecutando } },
        { ultimoLoteEm: null, iniciadoEm: { lt: limiteExecutando } },
      ],
    },
    data: {
      status: "erro",
      ativoTenantId: null,
      concluidoEm: agora,
      erro: `O robô parou de enviar dados por mais de ${minutosSemLote} minutos.`,
    },
  });
  const pendente = await db().honorarioSyncJob.updateMany({
    where: { tenantId, status: "pendente", solicitadoEm: { lt: limitePendente } },
    data: {
      status: "erro",
      ativoTenantId: null,
      concluidoEm: agora,
      erro: `Nenhum robô pegou a sincronização em ${horasPendente} horas.`,
    },
  });
  return executando.count + pendente.count;
}

export async function falharJob(id: string, erro: string, agora: Date): Promise<boolean> {
  const r = await db().honorarioSyncJob.updateMany({
    where: { id, tenantId: tenantAtual(), status: "executando" },
    data: { status: "erro", ativoTenantId: null, erro, concluidoEm: agora },
  });
  return r.count === 1;
}

/** Lê o status do job travando a linha (dentro da transação). */
async function statusComTrava(tx: Prisma.TransactionClient, jobId: string, tenantId: string) {
  const linhas = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM hon_sync_jobs WHERE id = ${jobId} AND tenantId = ${tenantId} FOR UPDATE`;
  return linhas[0]?.status ?? null;
}

/**
 * Grava um lote do robô. Idempotente por pasta: reenviar a mesma pasta
 * substitui os arquivos dela, sem duplicar.
 */
export async function gravarLote(jobId: string, lote: Lote, agora: Date): Promise<"ok" | "job_inativo"> {
  const tenantId = tenantAtual();
  return db().$transaction(
    async (tx) => {
      if ((await statusComTrava(tx, jobId, tenantId)) !== "executando") return "job_inativo";

      for (const pasta of lote.pastas) {
        const nomePasta = normalizarNomePasta(pasta.nomePasta);
        const nomePastaHash = hashDaPasta(nomePasta);
        const subpastasContrato = pasta.subpastasContrato.map(normalizarNomePasta);
        const p = await tx.honorarioPasta.upsert({
          where: { jobId_nomePastaHash: { jobId, nomePastaHash } },
          create: { jobId, nomePasta, nomePastaHash, subpastasContrato, erro: pasta.erro ?? null },
          update: { subpastasContrato, erro: pasta.erro ?? null },
          select: { id: true },
        });
        await tx.honorarioArquivo.deleteMany({ where: { pastaId: p.id } });
        if (pasta.arquivos.length) {
          await tx.honorarioArquivo.createMany({
            data: pasta.arquivos.map((a) => ({
              jobId,
              pastaId: p.id,
              caminhoRelativo: a.caminhoRelativo.normalize("NFC"),
              nome: a.nome.normalize("NFC"),
              ext: a.ext,
              tamanho: BigInt(a.tamanho),
              modificadoEm: new Date(a.modificadoEm),
              pdfAssinado: a.pdf ? a.pdf.assinado : null,
              pdfMarca: a.pdf?.marca ?? null,
            })),
          });
        }
      }

      const [pastasRecebidas, arquivosRecebidos] = await Promise.all([
        tx.honorarioPasta.count({ where: { jobId } }),
        tx.honorarioArquivo.count({ where: { jobId } }),
      ]);
      await tx.honorarioSyncJob.update({
        where: { id: jobId },
        data: {
          pastasRecebidas,
          arquivosRecebidos,
          ...(lote.totalPastas !== undefined && lote.totalPastas !== null ? { pastasTotal: lote.totalPastas } : {}),
          ultimoLoteEm: agora,
        },
      });
      return "ok" as const;
    },
    { timeout: 60_000 },
  );
}

export interface ResultadoConclusao {
  resultado: "ok" | "divergente" | "job_inativo";
  recebido: { pastas: number; arquivos: number };
}

/**
 * Fecha o job conferindo os totais do robô com o que chegou. Se não bater,
 * o job vira erro — e o relatório continua mostrando a última sincronização boa.
 */
export async function concluirJob(
  jobId: string,
  totais: { pastas: number; arquivos: number },
  agora: Date,
): Promise<ResultadoConclusao> {
  const tenantId = tenantAtual();
  return db().$transaction(async (tx) => {
    if ((await statusComTrava(tx, jobId, tenantId)) !== "executando") {
      return { resultado: "job_inativo", recebido: { pastas: 0, arquivos: 0 } };
    }
    const [pastas, arquivos] = await Promise.all([
      tx.honorarioPasta.count({ where: { jobId } }),
      tx.honorarioArquivo.count({ where: { jobId } }),
    ]);
    const recebido = { pastas, arquivos };
    const bate = recebido.pastas === totais.pastas && recebido.arquivos === totais.arquivos;
    await tx.honorarioSyncJob.update({
      where: { id: jobId },
      data: {
        status: bate ? "concluido" : "erro",
        ativoTenantId: null,
        erro: bate
          ? null
          : `Totais não batem: chegaram ${recebido.pastas} de ${totais.pastas} pastas e ` +
            `${recebido.arquivos} de ${totais.arquivos} arquivos.`,
        concluidoEm: agora,
        pastasRecebidas: recebido.pastas,
        arquivosRecebidos: recebido.arquivos,
      },
    });
    return { resultado: bate ? "ok" : "divergente", recebido };
  });
}

/** Apaga jobs finalizados mais velhos que `dias`, sempre preservando o último concluído. */
export async function limparJobsAntigos(agora: Date, dias = 30): Promise<number> {
  const tenantId = tenantAtual();
  const limite = new Date(agora.getTime() - dias * 86_400_000);
  const ultimo = await buscarUltimoConcluido();
  const r = await db().honorarioSyncJob.deleteMany({
    where: {
      tenantId,
      ativoTenantId: null,
      solicitadoEm: { lt: limite },
      ...(ultimo ? { id: { not: ultimo.id } } : {}),
    },
  });
  return r.count;
}

// ── Robô ──────────────────────────────────────────────────────────

export async function registrarHeartbeat(host: string, versao: string | null, agora: Date): Promise<void> {
  const tenantId = tenantAtual();
  await db().honorarioRobo.upsert({
    where: { tenantId_host: { tenantId, host } },
    create: { tenantId, host, versao, vistoEm: agora },
    update: { versao, vistoEm: agora },
  });
}

export async function buscarUltimoHeartbeat(): Promise<HeartbeatRow | null> {
  const r = await db().honorarioRobo.findFirst({ where: { tenantId: tenantAtual() }, orderBy: { vistoEm: "desc" } });
  return r ? { host: r.host, versao: r.versao, visto_em: r.vistoEm } : null;
}

// ── Pastas, vínculos e empresas ───────────────────────────────────

/** O job precisa ser deste escritório; o resto da consulta vai pelo id do job. */
async function jobDoEscritorio(jobId: string): Promise<boolean> {
  return !!(await db().honorarioSyncJob.findFirst({ where: { id: jobId, tenantId: tenantAtual() }, select: { id: true } }));
}

export async function listarPastasDoJob(jobId: string): Promise<PastaDoJobRow[]> {
  if (!(await jobDoEscritorio(jobId))) return [];
  const pastas = await db().honorarioPasta.findMany({
    where: { jobId },
    select: { nomePasta: true, subpastasContrato: true, erro: true, _count: { select: { arquivos: true } } },
  });
  return pastas.map((p) => ({
    nome_pasta: p.nomePasta,
    subpastas_contrato: Array.isArray(p.subpastasContrato) ? (p.subpastasContrato as string[]) : [],
    erro: p.erro,
    arquivos: p._count.arquivos,
  }));
}

export async function listarVinculos(): Promise<VinculoRow[]> {
  const v = await db().honorarioVinculoPasta.findMany({
    where: { tenantId: tenantAtual() },
    select: { nomePasta: true, companyId: true, tipo: true },
  });
  return v.map((x) => ({ nome_pasta: x.nomePasta, company_id: x.companyId, tipo: x.tipo as TipoVinculo }));
}

/**
 * As empresas do escritório, no formato do Aditiva: razão social, CNPJ com
 * máscara e o responsável (o da ficha da empresa). Só pessoa jurídica com
 * CNPJ — a pasta de contrato é de cliente PJ — e "inativo" é tudo o que não
 * é cliente ativo.
 */
export async function listarEmpresas(): Promise<EmpresaRow[]> {
  const tenantId = tenantAtual();
  const empresas = await db().company.findMany({
    where: { tenantId, cnpj: { not: null } },
    select: { id: true, name: true, cnpj: true, status: true, responsibleUserId: true },
  });
  const idsDeResponsaveis = [...new Set(empresas.map((e) => e.responsibleUserId).filter((id): id is string => !!id))];
  const responsaveis = new Map(
    (
      await db().user.findMany({ where: { tenantId, id: { in: idsDeResponsaveis } }, select: { id: true, name: true } })
    ).map((u) => [u.id, u.name]),
  );
  return empresas
    .filter((e) => (e.cnpj ?? "").replace(/\D/g, "").length === 14)
    .map((e) => ({
      id: e.id,
      razao_social: e.name,
      cnpj: comMascara(e.cnpj!),
      responsavel: (e.responsibleUserId && responsaveis.get(e.responsibleUserId)) || null,
      inativo: e.status === "ACTIVE" ? 0 : 1,
    }));
}

/** "12345678000190" → "12.345.678/0001-90" (o formato que o Aditiva guardava). */
export function comMascara(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : cnpj;
}

// ── Empresas sem pasta ────────────────────────────────────────────

export async function listarMarcasSemPasta(): Promise<MarcaSemPastaRow[]> {
  const m = await db().honorarioEmpresaSemPasta.findMany({ where: { tenantId: tenantAtual() } });
  return m.map((x) => ({ company_id: x.companyId, motivo: x.motivo, marcado_em: x.marcadoEm }));
}

export async function marcarSemPasta(companyId: string, motivo: string | null, agora: Date): Promise<void> {
  const tenantId = tenantAtual();
  await db().honorarioEmpresaSemPasta.upsert({
    where: { companyId },
    create: { companyId, tenantId, motivo, marcadoEm: agora },
    update: { motivo, marcadoEm: agora },
  });
}

export async function desmarcarSemPasta(companyId: string): Promise<void> {
  await db().honorarioEmpresaSemPasta.deleteMany({ where: { companyId, tenantId: tenantAtual() } });
}

export async function empresaExiste(id: string): Promise<boolean> {
  return !!(await db().company.findFirst({ where: { id, tenantId: tenantAtual() }, select: { id: true } }));
}

/** Grava vínculos automáticos sem tocar nos que já existem (confirmados e ignorados ficam como estão). */
export async function inserirVinculosAutomaticos(
  pares: { nomePasta: string; companyId: string }[],
  agora: Date,
): Promise<void> {
  if (!pares.length) return;
  const tenantId = tenantAtual();
  await db().honorarioVinculoPasta.createMany({
    data: pares.map((p) => {
      const nomePasta = normalizarNomePasta(p.nomePasta);
      return { tenantId, nomePasta, nomePastaHash: hashDaPasta(nomePasta), companyId: p.companyId, tipo: "auto", vinculadoEm: agora };
    }),
    skipDuplicates: true,
  });
}

export async function salvarVinculo(
  nomePasta: string,
  companyId: string | null,
  tipo: Exclude<TipoVinculo, "auto">,
  agora: Date,
): Promise<void> {
  const tenantId = tenantAtual();
  const nome = normalizarNomePasta(nomePasta);
  const nomePastaHash = hashDaPasta(nome);
  await db().honorarioVinculoPasta.upsert({
    where: { tenantId_nomePastaHash: { tenantId, nomePastaHash } },
    create: { tenantId, nomePasta: nome, nomePastaHash, companyId, tipo, vinculadoEm: agora },
    update: { companyId, tipo, vinculadoEm: agora },
  });
}

export async function removerVinculo(nomePasta: string): Promise<void> {
  await db().honorarioVinculoPasta.deleteMany({
    where: { tenantId: tenantAtual(), nomePastaHash: hashDaPasta(normalizarNomePasta(nomePasta)) },
  });
}
