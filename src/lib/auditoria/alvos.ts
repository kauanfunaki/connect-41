// Os cadastros que as linhas da auditoria citam, procurados no banco: o nome
// para a frase, o endereço para o link (só se o cadastro ainda existe) e a
// empresa de cada um ("… da Padaria Pão de Mel"). Também os nomes dos ids que
// o "de → para" guarda (pasta, centro de custo, responsável) e dos setores.
//
// Uma consulta por tipo de cadastro, só com os ids das linhas que estão na
// tela. Cada consulta é independente: se uma falhar, as linhas daquele tipo só
// ficam sem link.

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { TIPO_LABEL } from "@/lib/fiscal/rotulos";
import { getModuleDef } from "@/lib/module-catalog";
import { empresaNosDetalhes, idsCitados } from "./metadados";

export type Referencia = { entityType: string | null; entityId: string | null; metadata: unknown };

export type AlvoResolvido = { nome: string | null; href: string | null; empresaId: string | null };

export type Resolvidos = {
  /** Por `${entityType}:${entityId}` — só o que existe. */
  alvos: Map<string, AlvoResolvido>;
  empresas: Map<string, { nome: string; href: string }>;
  /** id (ou código de setor) → nome, para o "de → para" e os fatos da linha. */
  nomes: Map<string, string>;
};

export function chaveDoAlvo(entityType: string | null, entityId: string | null): string {
  return `${entityType ?? ""}:${entityId ?? ""}`;
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Buscador = (tenantId: string, ids: string[]) => Promise<Array<{ id: string } & AlvoResolvido>>;

/** Como achar cada tipo de cadastro que tem nome ou tela. Tipo fora daqui fica com o nome guardado na linha. */
const BUSCADORES: Readonly<Record<string, Buscador>> = {
  Company: async (tenantId, ids) =>
    (await getPrisma().company.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, displayName: true } })).map((r) => ({
      id: r.id,
      nome: nomeExibicao(r),
      href: `/empresas/${r.id}`,
      empresaId: null,
    })),
  Person: async (tenantId, ids) =>
    (await getPrisma().person.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: `/pessoas/${r.id}`,
      empresaId: null,
    })),
  User: async (tenantId, ids) =>
    (await getPrisma().user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: `/admin/usuarios/${r.id}/editar`,
      empresaId: null,
    })),
  FiscalDocument: async (tenantId, ids) =>
    (
      await getPrisma().fiscalDocument.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, type: true, number: true, companyId: true },
      })
    ).map((r) => ({
      id: r.id,
      nome: `${TIPO_LABEL[r.type] ?? r.type} ${Number.isFinite(Number(r.number)) ? new Intl.NumberFormat("pt-BR").format(Number(r.number)) : r.number}`,
      href: `/documentos-fiscais/${r.id}`,
      empresaId: r.companyId,
    })),
  FinanceEntry: async (tenantId, ids) =>
    (
      await getPrisma().financeEntry.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, kind: true, amount: true, companyId: true, counterparty: { select: { name: true } } },
      })
    ).map((r) => ({
      id: r.id,
      nome: `${r.counterparty.name} · ${REAIS.format(Number(r.amount))}`,
      href: `/${r.kind === "PAGAR" ? "pagar" : "receber"}?empresa=${r.companyId}`,
      empresaId: r.companyId,
    })),
  DriveFolder: async (tenantId, ids) =>
    (await getPrisma().driveFolder.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: `/arquivos/pasta/${r.id}`,
      empresaId: r.companyId,
    })),
  DriveFile: async (tenantId, ids) =>
    (
      await getPrisma().driveFile.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, name: true, folderId: true, folder: { select: { companyId: true } } },
      })
    ).map((r) => ({ id: r.id, nome: r.name, href: `/arquivos/pasta/${r.folderId}`, empresaId: r.folder.companyId })),
  Process: async (tenantId, ids) =>
    (
      await getPrisma().process.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, title: true, companyId: true, type: { select: { name: true } } },
      })
    ).map((r) => ({ id: r.id, nome: r.title || r.type.name, href: `/processos/${r.id}`, empresaId: r.companyId })),
  Lead: async (tenantId, ids) =>
    (await getPrisma().lead.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: `/leads/${r.id}`,
      empresaId: null,
    })),
  ServiceRequest: async (tenantId, ids) =>
    (await getPrisma().serviceRequest.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, number: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: `nº ${r.number}`,
      href: `/solicitacoes/${r.id}`,
      empresaId: r.companyId,
    })),
  ClientRequest: async (tenantId, ids) =>
    (await getPrisma().clientRequest.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, title: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.title,
      href: `/pendencias/${r.id}`,
      empresaId: r.companyId,
    })),
  ClientDocument: async (tenantId, ids) =>
    (await getPrisma().clientDocument.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, title: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.title,
      href: `/solicitacoes/envios/${r.id}`,
      empresaId: r.companyId,
    })),
  Handoff: async (tenantId, ids) =>
    (await getPrisma().handoff.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } })).map((r) => ({
      id: r.id,
      nome: null,
      href: `/transferencias/${r.id}`,
      empresaId: null,
    })),
  Candidatura: async (tenantId, ids) =>
    (
      await getPrisma().candidatura.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, vagaId: true, person: { select: { name: true } } },
      })
    ).map((r) => ({ id: r.id, nome: r.person.name, href: `/vagas/${r.vagaId}/candidaturas/${r.id}`, empresaId: null })),
  Vaga: async (tenantId, ids) =>
    (await getPrisma().vaga.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, title: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.title,
      href: `/vagas/${r.id}`,
      empresaId: r.companyId,
    })),
  Sector: async (tenantId, ids) =>
    (await getPrisma().sector.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, label: true } })).map((r) => ({
      id: r.id,
      nome: r.label,
      href: `/admin/setores/${r.id}/editar`,
      empresaId: null,
    })),
  Tag: async (tenantId, ids) =>
    (await getPrisma().tag.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: `/admin/tags/${r.id}/editar`,
      empresaId: null,
    })),
  CustomField: async (tenantId, ids) =>
    (await getPrisma().customField.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, label: true } })).map((r) => ({
      id: r.id,
      nome: r.label,
      href: `/admin/campos/${r.id}/editar`,
      empresaId: null,
    })),
  FinanceCategory: async (tenantId, ids) =>
    (await getPrisma().financeCategory.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      // Só a do escritório tem tela própria; a de uma empresa mora no cadastro financeiro dela.
      href: r.companyId ? null : `/admin/plano-de-contas/${r.id}/editar`,
      empresaId: r.companyId,
    })),
  ServiceRequestSubject: async (tenantId, ids) =>
    (await getPrisma().serviceRequestSubject.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, label: true } })).map((r) => ({
      id: r.id,
      nome: r.label,
      href: `/admin/assuntos/${r.id}/editar`,
      empresaId: null,
    })),
  AssessmentTemplate: async (tenantId, ids) =>
    (await getPrisma().assessmentTemplate.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: `/testes/templates/${r.id}/editar`,
      empresaId: null,
    })),
  PortalUser: async (tenantId, ids) =>
    (await getPrisma().portalUser.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: "/admin/portal",
      empresaId: null,
    })),
  SubscriptionPlan: async (_tenantId, ids) =>
    (await getPrisma().subscriptionPlan.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: "/admin/planos",
      empresaId: null,
    })),
  CompanyPartner: async (tenantId, ids) =>
    (await getPrisma().companyPartner.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: `/empresas/${r.companyId}/socios`,
      empresaId: r.companyId,
    })),
  Meeting: async (tenantId, ids) =>
    (await getPrisma().meeting.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, title: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.title,
      href: null,
      empresaId: r.companyId,
    })),
  CostCenter: async (tenantId, ids) =>
    (await getPrisma().costCenter.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: null,
      empresaId: r.companyId,
    })),
  FinanceCounterparty: async (tenantId, ids) =>
    (await getPrisma().financeCounterparty.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.name,
      href: null,
      empresaId: r.companyId,
    })),
  BankAccount: async (tenantId, ids) =>
    (await getPrisma().bankAccount.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, nickname: true, companyId: true } })).map((r) => ({
      id: r.id,
      nome: r.nickname,
      href: null,
      empresaId: r.companyId,
    })),
};

/** Tipos que se resolvem sem banco: o id já é o código. */
function alvoSemBanco(entityType: string, entityId: string): AlvoResolvido | null {
  if (entityType === "TenantModule") {
    const def = getModuleDef(entityId);
    return def ? { nome: def.label.split(" — ")[0]!.trim(), href: null, empresaId: null } : null;
  }
  return null;
}

async function semFalhar<T>(rotulo: string, p: Promise<T>, vazio: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[auditoria] ${rotulo}`, err);
    return vazio;
  }
}

/**
 * Procura os cadastros, as empresas e os ids citados das linhas da tela.
 * `setores` (código → nome) entra nos nomes, para "Setor: dp → fiscal" sair
 * com o nome de cada setor.
 */
export async function resolverReferencias(
  tenantId: string,
  referencias: readonly Referencia[],
  setores: Readonly<Record<string, string>>
): Promise<Resolvidos> {
  const porTipo = new Map<string, Set<string>>();
  const alvos = new Map<string, AlvoResolvido>();
  const citados = new Set<string>();
  const empresaIds = new Set<string>();

  for (const r of referencias) {
    if (r.entityType && r.entityId) {
      const semBanco = alvoSemBanco(r.entityType, r.entityId);
      if (semBanco) alvos.set(chaveDoAlvo(r.entityType, r.entityId), semBanco);
      else if (BUSCADORES[r.entityType]) {
        if (!porTipo.has(r.entityType)) porTipo.set(r.entityType, new Set());
        porTipo.get(r.entityType)!.add(r.entityId);
      }
      if (r.entityType === "Company") empresaIds.add(r.entityId);
    }
    const empresa = empresaNosDetalhes(r.metadata);
    if (empresa) empresaIds.add(empresa);
    for (const id of idsCitados(r.metadata)) citados.add(id);
  }

  const encontrados = await Promise.all(
    [...porTipo.entries()].map(async ([tipo, ids]) => ({
      tipo,
      linhas: await semFalhar(`busca de ${tipo}`, BUSCADORES[tipo](tenantId, [...ids]), []),
    }))
  );
  for (const { tipo, linhas } of encontrados) {
    for (const l of linhas) {
      alvos.set(chaveDoAlvo(tipo, l.id), { nome: l.nome, href: l.href, empresaId: l.empresaId });
      if (l.empresaId) empresaIds.add(l.empresaId);
    }
  }

  // Os ids que o "de → para" cita: pasta, centro de custo, responsável, empresa.
  const ids = [...citados].slice(0, 300);
  for (const id of ids) empresaIds.add(id);
  const [empresas, pastas, centros, usuarios] = await Promise.all([
    semFalhar("empresas", BUSCADORES.Company(tenantId, [...empresaIds]), []),
    ids.length ? semFalhar("pastas citadas", BUSCADORES.DriveFolder(tenantId, ids), []) : Promise.resolve([]),
    ids.length ? semFalhar("centros citados", BUSCADORES.CostCenter(tenantId, ids), []) : Promise.resolve([]),
    ids.length ? semFalhar("usuários citados", BUSCADORES.User(tenantId, ids), []) : Promise.resolve([]),
  ]);

  const nomes = new Map<string, string>(Object.entries(setores));
  for (const l of [...pastas, ...centros, ...usuarios, ...empresas]) if (l.nome) nomes.set(l.id, l.nome);
  for (const [chave, a] of alvos) {
    const id = chave.slice(chave.indexOf(":") + 1);
    if (a.nome && !nomes.has(id)) nomes.set(id, a.nome);
  }

  return {
    alvos,
    empresas: new Map(empresas.map((e) => [e.id, { nome: e.nome ?? "", href: e.href ?? `/empresas/${e.id}` }])),
    nomes,
  };
}
