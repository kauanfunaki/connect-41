import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { HandoffForm } from "@/components/transferencias/HandoffForm";
import { criarHandoff } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { getSectorUsers } from "@/lib/sectorUsers";
import type { EntityType } from "@/generated/prisma/enums";
import { mensagemComPropostas } from "@/lib/ia/chat/conversas";
import { lerPropostas } from "@/lib/ia/chat/regras";
import { CAMPOS_DA_EMPRESA_NO_SELETOR } from "@/lib/empresas/opcoesDoSeletor";
import { modelosPorUso } from "@/lib/handoffTemplates";

export default async function NovoHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string; daIa?: string; indice?: string }>;
}) {
  const { entityType: entityTypeRaw, entityId, daIa, indice } = await searchParams;
  const ctx = await getAuthContext();

  // Solicitar handoff é capacidade de SECTOR_ADMIN (e ADMIN/SUPER_ADMIN) — SECTOR_USER
  // e READONLY não podem, mesmo acessando a URL direto (o botão já fica escondido
  // pra eles, mas a página em si também precisa bloquear).
  const canCreate = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canCreate) notFound();

  const prisma = getPrisma();
  const [{ options: allSectorOptions, colors: sectorColors }, usos] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    // Quantas vezes cada modelo foi usado no escritório: os mais usados abrem
    // a lista de assuntos (10/11/2026).
    prisma.handoff.groupBy({
      by: ["templateKey"],
      where: { tenantId: ctx.tenantId, templateKey: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const fromSectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

  if (fromSectorOptions.length === 0) notFound();

  // A origem já preenchida (10/11/2026, pedido do Kauan): o setor ativo, ou o
  // único setor da pessoa entre os que ela pode usar. Com um setor só para
  // escolher, o formulário a mostra sem seletor.
  const proprios = fromSectorOptions.filter((s) => ctx.sectors.includes(s.value));
  const fromSectorInicial =
    ctx.activeSector && fromSectorOptions.some((s) => s.value === ctx.activeSector)
      ? ctx.activeSector
      : proprios.length === 1
        ? proprios[0].value
        : undefined;

  const toSectorOptions = allSectorOptions.map((s) => ({ ...s, color: sectorColors[s.value] ?? "#586577" }));
  const ordemDosModelos = modelosPorUso(
    Object.fromEntries(usos.filter((u) => u.templateKey).map((u) => [u.templateKey as string, u._count._all]))
  ).map((t) => t.key);

  // Lista de usuários pra autocomplete de "@menção" na Descrição — qualquer
  // usuário ativo do tenant pode ser referenciado, não só quem já atua no
  // setor de origem/destino (a pessoa pode ser de outro setor e ainda assim
  // precisar ser avisada).
  const mentionUsers = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Elegíveis a responsável por setor de destino — não dá pra saber de
  // antemão quais setores o usuário vai marcar no form, então busca pra
  // todos os setores possíveis (mesma lista que os setores de destino usam).
  const assigneeOptionsBySector = Object.fromEntries(
    await Promise.all(allSectorOptions.map(async (s) => [s.value, await getSectorUsers(ctx.tenantId, s.value)] as const))
  );

  // Transferência sugerida pelo chat de IA: a sugestão sai do banco, e só da
  // conversa de quem está logado — o texto nunca viaja pela URL.
  let inicial: { toSectors: string[]; description: string } | undefined;
  if (daIa && ctx.userId) {
    const m = await mensagemComPropostas({ tenantId: ctx.tenantId, userId: ctx.userId }, daIa);
    const p = m ? lerPropostas(m.proposals)[Number(indice) || 0] : undefined;
    const setor = typeof p?.argumentos.setor === "string" ? p.argumentos.setor : "";
    if (p?.ferramenta === "abrir_transferencia" && allSectorOptions.some((s) => s.value === setor)) {
      inicial = {
        toSectors: [setor],
        description: typeof p.argumentos.descricao === "string" ? p.argumentos.descricao : "",
      };
    }
  }

  const comum = {
    action: criarHandoff,
    fromSectorOptions,
    fromSectorInicial,
    toSectorOptions,
    mentionUsers,
    assigneeOptionsBySector,
    inicial,
    ordemDosModelos,
  };

  // Modo 1: entidade pré-selecionada (veio do "Solicitar transferência" na ficha)
  if (entityId) {
    const entityType = entityTypeRaw === "PERSON" ? "PERSON" : "COMPANY";
    const scope = entityType === "COMPANY" ? await scopedCompanyWhere(ctx) : await scopedPersonWhere(ctx);
    const entity =
      entityType === "COMPANY"
        ? await prisma.company.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true, displayName: true, cnpj: true } })
        : await prisma.person.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true } });

    if (!entity) notFound();

    const backHref = entityType === "COMPANY" ? `/empresas/${entityId}` : `/pessoas/${entityId}`;
    const entityCnpj: string | null = "cnpj" in entity ? (entity.cnpj as string | null) : null;
    const apelido = "displayName" in entity ? (entity.displayName as string | null)?.trim() : null;
    const entityName = apelido || entity.name;

    return (
      <FormShell backHref={backHref} backLabel={entityName}>
        <HandoffForm
          {...comum}
          cancelHref={backHref}
          fixedEntity={{ entityType: entityType as EntityType, entityId: entity.id, entityName, entityCnpj }}
        />
      </FormShell>
    );
  }

  // Modo 2: acesso direto por /transferencias — escolhe a entidade no próprio formulário
  const [companies, people] = await Promise.all([
    prisma.company.findMany({
      where: await scopedCompanyWhere(ctx),
      orderBy: { name: "asc" },
      select: CAMPOS_DA_EMPRESA_NO_SELETOR,
    }),
    prisma.person.findMany({
      where: await scopedPersonWhere(ctx),
      orderBy: { name: "asc" },
      select: { id: true, name: true, photoUrl: true },
    }),
  ]);

  return (
    <FormShell backHref="/transferencias" backLabel="Transferências">
      <HandoffForm {...comum} cancelHref="/transferencias" companies={companies} people={people} />
    </FormShell>
  );
}

// Só a trilha em cima do cartão (10/11/2026): o título "Nova transferência" e
// os três passos moram dentro do cartão, centralizados, como no desenho
// escolhido e no Novo processo.
function FormShell({
  backHref,
  backLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <PageContainer>
      <Breadcrumb items={[{ label: backLabel, href: backHref, truncate: true }, { label: "Nova transferência" }]} />
      {children}
    </PageContainer>
  );
}
