// As duas funções de IA do Societário que vieram do protótipo (29/09): a
// varredura de pendências e a leitura do contrato social. Aqui fica o lado do
// servidor — ler o banco, chamar a IA e deixar a proposta na fila do setor.
// Aplicar o que foi aprovado é das actions de `/societario/ia`.

import { getPrisma } from "@/lib/prisma";
import { gerarEstruturado } from "@/lib/ai";
import { criarProposta } from "@/lib/ia/propostas";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDate } from "@/lib/format";
import { limitesDoSetor } from "@/lib/gestao/regras";
import {
  SISTEMA_DA_VARREDURA,
  lerAvaliacao,
  schemaDaAvaliacao,
  sinaisDaVarredura,
  textoParaAIa,
  type AvaliacaoDaVarredura,
  type Sinal,
} from "@/lib/societario/varredura";
import { SCHEMA_DO_CONTRATO, SISTEMA_DO_CONTRATO, lerContrato, type LeituraDoContrato } from "@/lib/societario/contratoSocial";

export const AGENTE_VARREDURA = "varredura_do_societario";
export const AGENTE_CONTRATO = "leitor_de_contrato_social";

/** O que a proposta da varredura guarda. */
export type PayloadDaVarredura = { sinais: Sinal[]; avaliacao: AvaliacaoDaVarredura };
/** O que a proposta do contrato guarda. O PDF não é guardado — só o que foi lido. */
export type PayloadDoContrato = { arquivo: string; leitura: LeituraDoContrato };

const nomeDoProcesso = (p: { title: string | null; type: { name: string }; company: { name: string; displayName: string | null } }) =>
  `${p.type.name} — ${nomeExibicao(p.company)}${p.title ? ` (${p.title})` : ""}`;

function maisRecente(...datas: (Date | null | undefined)[]): Date {
  return new Date(Math.max(...datas.filter((d): d is Date => !!d).map((d) => d.getTime())));
}

/** Lê o que está aberto no Societário do tenant e devolve as pendências. */
export async function sinaisDoTenant(tenantId: string, agora = new Date(), sectorCode = "societario"): Promise<Sinal[]> {
  const prisma = getPrisma();
  const configDoSetor = await prisma.sector.findFirst({
    where: { tenantId, code: sectorCode },
    select: { alertStalledDays: true, alertDueSoonDays: true },
  });
  const empresa = { select: { name: true, displayName: true } };
  const [processos, exigencias, licencas] = await Promise.all([
    prisma.process.findMany({
      where: { tenantId, status: { notIn: ["CONCLUIDO", "CANCELADO", "INDEFERIDO"] } },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        updatedAt: true,
        type: { select: { name: true } },
        company: empresa,
        steps: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        protocols: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        messages: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 2000,
    }),
    prisma.processRequirement.findMany({
      where: { tenantId, resolvedAt: null, dueAt: { lt: agora } },
      select: {
        id: true,
        description: true,
        dueAt: true,
        protocol: {
          select: {
            process: { select: { id: true, status: true, title: true, type: { select: { name: true } }, company: empresa } },
          },
        },
      },
      take: 2000,
    }),
    prisma.license.findMany({
      where: { tenantId, revokedAt: null, expiresAt: { not: null, lte: new Date(agora.getTime() + 31 * 24 * 60 * 60 * 1000) } },
      select: { id: true, kind: true, expiresAt: true, company: empresa },
      take: 2000,
    }),
  ]);

  return sinaisDaVarredura(
    {
      processos: processos.map((p) => ({
        id: p.id,
        nome: nomeDoProcesso(p),
        status: p.status,
        dueAt: p.dueAt,
        ultimaMovimentacao: maisRecente(p.updatedAt, p.steps[0]?.updatedAt, p.protocols[0]?.updatedAt, p.messages[0]?.createdAt),
      })),
      exigencias: exigencias
        // Exigência de processo encerrado não é mais trabalho do setor.
        .filter((e) => !["CONCLUIDO", "CANCELADO", "INDEFERIDO"].includes(e.protocol.process.status))
        .map((e) => ({
          id: e.id,
          descricao: e.description,
          dueAt: e.dueAt!,
          processo: { id: e.protocol.process.id, nome: nomeDoProcesso(e.protocol.process) },
        })),
      licencas: licencas.map((l) => ({ id: l.id, tipo: l.kind, empresa: nomeExibicao(l.company), expiresAt: l.expiresAt! })),
    },
    agora,
    limitesDoSetor(configDoSetor ?? undefined).diasParado
  );
}

export type ResultadoDaVarredura = { tipo: "vazia" } | { tipo: "proposta"; propostaId: string; pendencias: number };

/**
 * Roda a varredura: o código acha, a IA ordena, e o resultado vira uma
 * proposta na fila. Sem pendência nenhuma, não chama a IA nem cria proposta —
 * não há o que aprovar, e não se paga por isso.
 */
export async function rodarVarredura(params: { tenantId: string; userId: string; sectorCode: string }): Promise<ResultadoDaVarredura> {
  const agora = new Date();
  const sinais = await sinaisDoTenant(params.tenantId, agora, params.sectorCode);
  if (sinais.length === 0) return { tipo: "vazia" };

  const { valor, runId } = await gerarEstruturado({
    tenantId: params.tenantId,
    agentCode: AGENTE_VARREDURA,
    sistema: SISTEMA_DA_VARREDURA,
    texto: textoParaAIa(sinais, agora),
    nome: "varredura_do_societario",
    schema: schemaDaAvaliacao(sinais.map((s) => s.chave)),
    maxTokens: 4096,
    contexto: { userId: params.userId, entityType: "setor", entityId: params.sectorCode },
  });
  const avaliacao = lerAvaliacao(valor, sinais);
  const dia = formatInstantDate(agora, { day: "2-digit", month: "2-digit" });
  const payload: PayloadDaVarredura = { sinais, avaliacao };
  const propostaId = await criarProposta({
    tenantId: params.tenantId,
    agentCode: AGENTE_VARREDURA,
    sectorCode: params.sectorCode,
    runId,
    title: `Varredura de ${dia}: ${sinais.length} ${sinais.length === 1 ? "pendência" : "pendências"}`,
    payload: payload as unknown as object,
    confidence: avaliacao.confianca,
    createdById: params.userId,
  });
  return { tipo: "proposta", propostaId, pendencias: sinais.length };
}

/** Lê o PDF do contrato social e deixa a leitura na fila, ligada à empresa. */
export async function lerContratoSocial(params: {
  tenantId: string;
  userId: string;
  sectorCode: string;
  companyId: string;
  empresaNome: string;
  pdfBase64: string;
  nomeDoArquivo: string;
}): Promise<{ propostaId: string; socios: number }> {
  const { valor, runId } = await gerarEstruturado({
    tenantId: params.tenantId,
    agentCode: AGENTE_CONTRATO,
    sistema: SISTEMA_DO_CONTRATO,
    texto: `Leia este documento da empresa ${params.empresaNome} e devolva o quadro de sócios como fica depois dele.`,
    pdfBase64: params.pdfBase64,
    nomeDoArquivo: params.nomeDoArquivo,
    nome: "contrato_social",
    schema: SCHEMA_DO_CONTRATO,
    maxTokens: 8192,
    contexto: { userId: params.userId, entityType: "empresa", entityId: params.companyId },
  });
  const leitura = lerContrato(valor);
  const payload: PayloadDoContrato = { arquivo: params.nomeDoArquivo, leitura };
  const propostaId = await criarProposta({
    tenantId: params.tenantId,
    agentCode: AGENTE_CONTRATO,
    sectorCode: params.sectorCode,
    runId,
    entityType: "Company",
    entityId: params.companyId,
    title: `Contrato social de ${params.empresaNome}: ${leitura.socios.length} ${leitura.socios.length === 1 ? "sócio" : "sócios"}`,
    payload: payload as unknown as object,
    confidence: leitura.confianca,
    createdById: params.userId,
  });
  return { propostaId, socios: leitura.socios.length };
}
