"use server";

// O lado do cliente numa solicitação: abrir, responder e cancelar.
//
// Autoria no próprio modelo (`openedByPortalUserId`, `authorPortalUserId`),
// como na pendência: o AuditLog exige um `User` interno, e cliente não é um.
//
// Empresa sempre do alcance no `where`: solicitação de outro grupo responde
// "não encontrada", igual a uma que não existe.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { nomeExibicao } from "@/lib/companyName";
import { saoPauloParts } from "@/lib/agenda";
import { lerDataDoCampo } from "@/lib/societario/datas";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { validarResposta } from "@/lib/financeiro/pendencias/regras";
import { anexosDaSolicitacao } from "@/lib/solicitacoes/armazenamento";
import { somarDiasUteis, transicao, validarAbertura } from "@/lib/solicitacoes/regras";
import { avisarEquipeDaSolicitacao, responsavelDaEmpresaNoSetor } from "@/lib/solicitacoes/avisos";

const MODULO = "portal_solicitacoes";

export type ResultadoDaAbertura = { error: string } | { ok: true; id: string; numero: number };
export type ResultadoDoPortal = { error: string } | { ok: true };

/** Erro de regra dentro da transação: aborta o que já foi gravado e vira mensagem. */
class Recusa extends Error {}

function revalidar(id?: string) {
  revalidatePath("/portal/solicitacoes");
  revalidatePath("/portal");
  revalidatePath("/solicitacoes");
  if (id) {
    revalidatePath(`/portal/solicitacoes/${id}`);
    revalidatePath(`/solicitacoes/${id}`);
  }
}

async function clienteComSolicitacoes() {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { ok: false as const, erro: "Sessão expirada. Entre de novo no portal." };
  if (!cliente.modulos.has(MODULO)) return { ok: false as const, erro: "As solicitações não estão habilitadas." };
  return { ok: true as const, cliente };
}

/**
 * Abre a solicitação.
 *
 * O prazo de resposta é contado **aqui**, com os feriados do tenant, e gravado:
 * mudar o prazo do assunto depois não muda a promessa já feita ao cliente.
 * O responsável vem do serviço da empresa no setor do assunto, se houver.
 */
export async function abrirSolicitacao(formData: FormData): Promise<ResultadoDaAbertura> {
  const c = await clienteComSolicitacoes();
  if (!c.ok) return { error: c.erro };
  const { cliente } = c;
  const prisma = getPrisma();

  const empresa = await prisma.company.findFirst({
    where: { tenantId: cliente.tenantId, AND: [{ id: String(formData.get("companyId") ?? "") }, { id: { in: cliente.companyIds } }] },
    select: { id: true, name: true, displayName: true },
  });
  if (!empresa) return { error: "Escolha a empresa." };

  const assunto = await prisma.serviceRequestSubject.findFirst({
    where: { id: String(formData.get("subjectId") ?? ""), tenantId: cliente.tenantId, active: true },
    select: { id: true, label: true, sectorCode: true, responseDays: true },
  });
  if (!assunto) return { error: "Escolha o assunto." };

  const texto = validarAbertura(String(formData.get("description") ?? ""));
  if (!texto.ok) return { error: texto.erro };

  const feriados = await feriadosDoTenant(cliente.tenantId);
  const prazo = lerDataDoCampo(somarDiasUteis(saoPauloParts(new Date()).dateKey, assunto.responseDays, feriados));
  if (!prazo.ok || !prazo.data) throw new Error("Prazo de resposta inválido.");
  const responseDue = prazo.data;

  const assigneeId = await responsavelDaEmpresaNoSetor(cliente.tenantId, empresa.id, assunto.sectorCode);

  const gravados = await anexosDaSolicitacao.gravarAnexos(cliente.tenantId, arquivosDoFormulario(formData, "anexos"));
  if (!gravados.ok) return { error: gravados.erro };

  // O número é o maior do tenant + 1, dentro da transação. Dois clientes
  // abrindo no mesmo instante podem calcular o mesmo número: o índice único
  // recusa o segundo, e ele tenta de novo com o número seguinte.
  let criada: { id: string; number: number } | null = null;
  try {
    for (let tentativa = 0; tentativa < 3 && !criada; tentativa++) {
      try {
        criada = await prisma.$transaction(async (tx) => {
          const maior = await tx.serviceRequest.aggregate({ where: { tenantId: cliente.tenantId }, _max: { number: true } });
          const s = await tx.serviceRequest.create({
            data: {
              tenantId: cliente.tenantId,
              number: (maior._max.number ?? 0) + 1,
              companyId: empresa.id,
              subjectId: assunto.id,
              sectorCode: assunto.sectorCode,
              description: texto.texto,
              responseDue,
              assigneeId,
              openedByPortalUserId: cliente.usuario.id,
            },
            select: { id: true, number: true },
          });
          if (gravados.anexos.length > 0) {
            await tx.serviceRequestAttachment.createMany({
              data: gravados.anexos.map((a) => ({ requestId: s.id, uploadedByPortalUserId: cliente.usuario.id, ...a })),
            });
          }
          return s;
        });
      } catch (err) {
        if (!isPrismaUniqueError(err)) throw err;
      }
    }
  } catch (err) {
    await anexosDaSolicitacao.apagarAnexosGravados(gravados.anexos);
    throw err;
  }
  if (!criada) {
    await anexosDaSolicitacao.apagarAnexosGravados(gravados.anexos);
    throw new Error("Não foi possível numerar a solicitação.");
  }

  await avisarEquipeDaSolicitacao(
    {
      tenantId: cliente.tenantId,
      id: criada.id,
      numero: criada.number,
      assunto: assunto.label,
      empresaNome: nomeExibicao(empresa),
      setor: assunto.sectorCode,
      assigneeId,
    },
    "nova"
  );

  revalidar(criada.id);
  return { ok: true, id: criada.id, numero: criada.number };
}

async function daEmpresaDoCliente(tenantId: string, companyIds: string[], id: string) {
  return getPrisma().serviceRequest.findFirst({
    where: { id, tenantId, companyId: { in: companyIds } },
    select: {
      id: true,
      number: true,
      status: true,
      sectorCode: true,
      assigneeId: true,
      subject: { select: { label: true } },
      company: { select: { name: true, displayName: true } },
    },
  });
}

/** Responde com texto e/ou anexos. Numa concluída, reabre (ver `transicao`). */
export async function responderSolicitacaoCliente(formData: FormData): Promise<ResultadoDoPortal> {
  const c = await clienteComSolicitacoes();
  if (!c.ok) return { error: c.erro };
  const { cliente } = c;

  const s = await daEmpresaDoCliente(cliente.tenantId, cliente.companyIds, String(formData.get("requestId") ?? ""));
  if (!s) return { error: "Solicitação não encontrada." };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const resposta = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!resposta.ok) return { error: resposta.erro };
  const t = transicao(s.status, "CLIENTE", "RESPONDER");
  if (!t.ok) return { error: t.motivo };

  const gravados = await anexosDaSolicitacao.gravarAnexos(cliente.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  const agora = new Date();
  try {
    await getPrisma().$transaction(async (tx) => {
      const mudou = await tx.serviceRequest.updateMany({
        where: { id: s.id, tenantId: cliente.tenantId, status: s.status },
        // Reaberta pelo cliente deixa de estar encerrada.
        data: { status: t.novo, lastMessageAt: agora, ...(s.status === "CONCLUIDA" ? { closedAt: null, closedById: null } : {}) },
      });
      if (mudou.count !== 1) throw new Recusa("A solicitação acabou de mudar — atualize a página.");
      const msg = await tx.serviceRequestMessage.create({
        data: { requestId: s.id, authorPortalUserId: cliente.usuario.id, body: resposta.corpo },
        select: { id: true },
      });
      if (gravados.anexos.length > 0) {
        await tx.serviceRequestAttachment.createMany({
          data: gravados.anexos.map((a) => ({ requestId: s.id, messageId: msg.id, uploadedByPortalUserId: cliente.usuario.id, ...a })),
        });
      }
    });
  } catch (err) {
    await anexosDaSolicitacao.apagarAnexosGravados(gravados.anexos);
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  await avisarEquipeDaSolicitacao(
    {
      tenantId: cliente.tenantId,
      id: s.id,
      numero: s.number,
      assunto: s.subject.label,
      empresaNome: nomeExibicao(s.company),
      setor: s.sectorCode,
      assigneeId: s.assigneeId,
    },
    "resposta"
  );

  revalidar(s.id);
  return { ok: true };
}

/**
 * O cliente desiste: "não preciso mais".
 *
 * Devolve `null` no sucesso, e não `{ ok }`: é o contrato do botão com
 * confirmação (`ConfirmActionButton`) que chama esta action.
 */
export async function cancelarSolicitacaoCliente(id: string): Promise<{ error: string } | null> {
  const c = await clienteComSolicitacoes();
  if (!c.ok) return { error: c.erro };
  const { cliente } = c;

  const s = await daEmpresaDoCliente(cliente.tenantId, cliente.companyIds, id);
  if (!s) return { error: "Solicitação não encontrada." };
  const t = transicao(s.status, "CLIENTE", "CANCELAR");
  if (!t.ok) return { error: t.motivo };

  const mudou = await getPrisma().serviceRequest.updateMany({
    where: { id: s.id, tenantId: cliente.tenantId, status: s.status },
    data: { status: t.novo, closedAt: new Date(), closedById: null },
  });
  if (mudou.count !== 1) return { error: "A solicitação acabou de mudar — atualize a página." };

  await avisarEquipeDaSolicitacao(
    {
      tenantId: cliente.tenantId,
      id: s.id,
      numero: s.number,
      assunto: s.subject.label,
      empresaNome: nomeExibicao(s.company),
      setor: s.sectorCode,
      assigneeId: s.assigneeId,
    },
    "cancelada"
  );

  revalidar(s.id);
  return null;
}
