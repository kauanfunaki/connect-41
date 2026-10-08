import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, type AuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere, scopedVagaWhere } from "@/lib/auth/scope";
import { podeNoModulo } from "@/lib/auth/modulo";
import { boardPath } from "@/lib/kanbanPaths";
import { digitsOnly } from "@/lib/validation/common";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";

const LIMIT = 5;

// O processo do Societário entra na busca (07/10/2026): achar "a Ótica
// Alvorada" na fila de 174 processos importados exigia rolar ou abrir o funil.
// O gate é o mesmo da fila e do detalhe (`/processos`, `/processos/[id]`): o
// setor que opera o módulo neste escritório, no nível de agir, e o módulo
// ligado. Quem não abre a ficha não vê o resultado.
const MODULO_DE_PROCESSOS = "societario_processos";

async function abreProcessos(ctx: AuthContext): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const [setor, ligado] = await Promise.all([
    setorDoModulo(ctx.tenantId, MODULO_DE_PROCESSOS),
    isModuleEnabled(ctx.tenantId, MODULO_DE_PROCESSOS),
  ]);
  return ligado && canActOnSector(ctx, setor ?? "societario");
}

const ENCERRADO: Partial<Record<string, string>> = { CONCLUIDO: "Concluído", CANCELADO: "Cancelado", INDEFERIDO: "Indeferido" };

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ companies: [], people: [], candidatos: [], pipelines: [], vagas: [], documentos: [], tarefas: [], processos: [] });
  }

  const prisma = getPrisma();
  const cnpjDigits = digitsOnly(q);
  // A ficha do candidato só abre para quem alcança o módulo de Candidatos
  // (02/10/2026); listar para os outros levaria a um 404.
  const [veCandidatos, veProcessos] = await Promise.all([podeNoModulo(ctx, "recrutamento_candidatos", "ver"), abreProcessos(ctx)]);
  const [companies, people, candidatos, pipelines, vagas, documentos, tarefaItems, processos] = await Promise.all([
    prisma.company.findMany({
      where: {
        ...(await scopedCompanyWhere(ctx)),
        OR: [
          { name: { contains: q } },
          { externalId: { contains: q } },
          // Os dois documentos, porque quem digita números na busca não
          // separa cliente PJ de PF na cabeça. O `contains` cobre busca por
          // pedaço (raiz do CNPJ, começo do CPF), então não dá para trocar
          // por igualdade mesmo agora que existem os índices únicos.
          ...(cnpjDigits ? [{ cnpj: { contains: cnpjDigits } }, { cpf: { contains: cnpjDigits } }] : []),
        ],
      },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    prisma.person.findMany({
      where: { ...(await scopedPersonWhere(ctx)), type: "COLABORADOR", name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true },
    }),
    veCandidatos
      ? prisma.person.findMany({
          where: { ...(await scopedPersonWhere(ctx)), type: "CANDIDATO", name: { contains: q } },
          orderBy: { name: "asc" },
          take: LIMIT,
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    prisma.pipeline.findMany({
      where: { ...scopedPipelineWhere(ctx), name: { contains: q } },
      orderBy: { name: "asc" },
      take: LIMIT,
      select: { id: true, name: true, sectorCode: true },
    }),
    prisma.vaga.findMany({
      where: { ...scopedVagaWhere(ctx), title: { contains: q } },
      orderBy: { title: "asc" },
      take: LIMIT,
      select: { id: true, title: true },
    }),
    // Documento não tem página própria — o resultado leva pra ficha da
    // entidade dona (Empresa/Pessoa/Vaga). Documentos de item de Kanban
    // (PIPELINE_ITEM) caem no fallback /kanban, sem link fundo certo.
    prisma.document.findMany({
      where: { tenantId: ctx.tenantId, fileName: { contains: q } },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { id: true, fileName: true, entityType: true, entityId: true },
    }),
    // Tarefas: só bate por título próprio (top-level normalmente não tem — usa
    // o nome da entidade, que já aparece nas categorias Empresas/Pessoas acima)
    // ou por descrição. Cobre principalmente subtarefas e itens com título.
    prisma.pipelineItem.findMany({
      where: {
        pipeline: scopedPipelineWhere(ctx),
        OR: [{ title: { contains: q } }, { description: { contains: q } }],
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT,
      select: { id: true, title: true, entityId: true, entityType: true, pipeline: { select: { id: true, sectorCode: true } } },
    }),
    // Processo: pela empresa (razão social ou apelido), pelo tipo ou pelo
    // título que diferencia dois do mesmo tipo. Os encerrados também — o
    // detalhe abre —, os mexidos por último primeiro.
    veProcessos
      ? prisma.process.findMany({
          where: {
            tenantId: ctx.tenantId,
            OR: [
              { title: { contains: q } },
              { company: { name: { contains: q } } },
              { company: { displayName: { contains: q } } },
              { type: { name: { contains: q } } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: LIMIT,
          select: {
            id: true,
            title: true,
            status: true,
            company: { select: { name: true, displayName: true } },
            type: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const tarefaEntityIds = { COMPANY: new Set<string>(), PERSON: new Set<string>() };
  for (const t of tarefaItems) {
    if (t.entityType && t.entityId) tarefaEntityIds[t.entityType].add(t.entityId);
  }
  const [tarefaCompanies, tarefaPeople] = await Promise.all([
    tarefaEntityIds.COMPANY.size > 0
      ? prisma.company.findMany({ where: { id: { in: [...tarefaEntityIds.COMPANY] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    tarefaEntityIds.PERSON.size > 0
      ? prisma.person.findMany({ where: { id: { in: [...tarefaEntityIds.PERSON] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const tarefaEntityNames: Record<string, string> = {};
  for (const c of tarefaCompanies) tarefaEntityNames[c.id] = c.name;
  for (const p of tarefaPeople) tarefaEntityNames[p.id] = p.name;

  return NextResponse.json({
    companies,
    people,
    candidatos,
    pipelines,
    vagas: vagas.map((v) => ({ id: v.id, name: v.title })),
    documentos: documentos.map((d) => ({ id: d.id, name: d.fileName, entityType: d.entityType, entityId: d.entityId })),
    tarefas: tarefaItems.map((t) => ({
      id: t.id,
      name: t.title ?? (t.entityId ? tarefaEntityNames[t.entityId] : null) ?? "(sem título)",
      href: `${boardPath(t.pipeline)}/itens/${t.id}`,
    })),
    processos: processos.map((p) => ({
      id: p.id,
      name: `${nomeExibicao(p.company)} · ${p.type.name}${p.title ? ` · ${p.title}` : ""}`,
      detalhe: ENCERRADO[p.status],
    })),
  });
}
