"use server";

// Publicar o roteiro de um tipo de processo pela tela (09/11/2026). Arquivo
// próprio, fora de `processos/actions.ts`, para as mudanças das duas frentes
// não se cruzarem.
//
// Quem pode: o nível "gerir" do módulo de processos — a coordenação do setor
// que opera o Societário (SECTOR_ADMIN dele), o Administrador e o Super Admin.
// Roteiro é configuração do módulo: muda o que todo processo novo vai pedir, e
// não é gesto do dia a dia de quem toca processo ("agir").

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { lerRoteiro, mesmoRoteiro, proximaVersao, type CampoDoRoteiro } from "@/lib/societario/roteiroEditavel";
import { etapasDaVersao } from "@/lib/societario/roteirosServidor";

const MODULO = "societario_processos";

export type ResultadoDaPublicacao =
  | { ok: true; versao: number }
  | { ok: false; erro: string; indice?: number; campo?: CampoDoRoteiro };

const pedidoSchema = z.object({
  tipoId: z.string().min(1).max(64),
  versaoBase: z.number().int().min(0),
  etapas: z.unknown(),
});

const RECARREGUE = "Recarregue a página para editar a partir dela — o que você mudou aqui não foi gravado.";

/**
 * Publica uma versão nova do roteiro do tipo: `version + 1`, publicada, com
 * todas as etapas e itens copiados, numa transação. A versão que valia deixa de
 * ser publicada — só uma por tipo, como diz o schema; quem lê `published`
 * (abertura de processo, importação do Trello, dados de exemplo) já pegava a de
 * maior versão. Processo em andamento guarda o `templateId` da versão em que
 * começou e não muda.
 *
 * `versaoBase` é a maior versão que a tela carregou. Se outra pessoa publicou
 * no meio, a gravação é recusada em vez de passar por cima do que ela fez.
 */
export async function publicarRoteiro(pedido: { tipoId: string; versaoBase: number; etapas: unknown }): Promise<ResultadoDaPublicacao> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado." };
  if (!(await podeNoModulo(ctx, MODULO, "gerir"))) return { ok: false, erro: "Só a coordenação do Societário edita os roteiros." };
  const lidoPedido = pedidoSchema.safeParse(pedido);
  if (!lidoPedido.success) return { ok: false, erro: "Pedido inválido. Recarregue a página e tente de novo." };
  const { tipoId, versaoBase } = lidoPedido.data;
  const tenantId = ctx.tenantId;

  const prisma = getPrisma();
  const [tipo, orgaos] = await Promise.all([
    prisma.processType.findFirst({ where: { id: tipoId, tenantId }, select: { id: true, name: true } }),
    prisma.processOrgan.findMany({ where: { tenantId }, select: { id: true } }),
  ]);
  if (!tipo) return { ok: false, erro: "Tipo de processo não encontrado." };

  const lido = lerRoteiro(lidoPedido.data.etapas, new Set(orgaos.map((o) => o.id)));
  if (!lido.ok) return lido;
  const etapas = lido.etapas;

  let publicada: { id: string; versao: number };
  try {
    const r = await prisma.$transaction(
      async (tx) => {
        const versoes = await tx.processTemplate.findMany({
          where: { tenantId, typeId: tipo.id },
          orderBy: { version: "desc" },
          select: { id: true, version: true, published: true },
        });
        const maior = versoes[0]?.version ?? 0;
        if (maior !== versaoBase) {
          return { ok: false as const, erro: `Outra pessoa publicou a versão ${maior} deste roteiro enquanto você editava. ${RECARREGUE}` };
        }
        const vigente = versoes.find((v) => v.published);
        if (vigente && mesmoRoteiro(await etapasDaVersao(tx, vigente.id), etapas)) {
          return { ok: false as const, erro: `Nada mudou em relação à versão ${vigente.version}, que continua em vigor.` };
        }

        const versao = proximaVersao(versoes.map((v) => v.version));
        const template = await tx.processTemplate.create({
          data: { tenantId, typeId: tipo.id, version: versao, published: true },
          select: { id: true },
        });
        // Ids e `createdAt` decididos aqui, para gravar as etapas e os itens em
        // duas inserções (a latência até o banco já estourou transação de
        // script com inserção uma a uma). O `createdAt` anda 1 ms por etapa:
        // é ele que guarda a ordem entre as paralelas, que dividem a posição.
        const inicio = Date.now();
        const passos = etapas.map((e, i) => ({
          id: randomUUID(),
          tenantId,
          templateId: template.id,
          position: e.posicao,
          label: e.rotulo,
          description: e.descricao,
          parallelGroup: e.grupo,
          expectedActor: e.executor,
          organId: e.orgaoId,
          optional: e.opcional,
          createdAt: new Date(inicio + i),
        }));
        await tx.processTemplateStep.createMany({ data: passos });
        const itens = etapas.flatMap((e, i) =>
          e.itens.map((item, k) => ({ tenantId, stepId: passos[i].id, position: k + 1, label: item.rotulo, required: item.obrigatorio }))
        );
        if (itens.length > 0) await tx.processTemplateChecklistItem.createMany({ data: itens });
        await tx.processTemplate.updateMany({
          where: { tenantId, typeId: tipo.id, published: true, id: { not: template.id } },
          data: { published: false },
        });
        return { ok: true as const, id: template.id, versao };
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
    if (!r.ok) return r;
    publicada = { id: r.id, versao: r.versao };
  } catch (err) {
    // Duas publicações ao mesmo tempo: a segunda bate no `@@unique([typeId, version])`.
    if (isPrismaUniqueError(err)) return { ok: false, erro: `Outra pessoa publicou uma versão deste roteiro agora há pouco. ${RECARREGUE}` };
    console.error("[publicarRoteiro]", err);
    return { ok: false, erro: "Erro ao publicar o roteiro. Tente de novo." };
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "societario.roteiro.publicado",
    entityType: "ProcessTemplate",
    entityId: publicada.id,
    metadata: { nome: `${tipo.name}, versão ${publicada.versao}`, tipo: tipo.name, versao: publicada.versao, anterior: versaoBase || null, etapas: etapas.length },
  });

  revalidatePath("/processos/roteiros");
  revalidatePath(`/processos/roteiros/${tipo.id}`);
  revalidatePath("/processos/novo");
  return { ok: true, versao: publicada.versao };
}
