// O pedido pelo link público (09/11/2026) — o que toca o banco: para onde o
// link aponta, a marca do escritório na página e a empresa prospecto do pedido.
// As regras puras moram em `pedidoPublico.ts` e `linkPublico.ts`.

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { isModuleEnabled } from "@/lib/modules";
import { lerAparencia } from "@/lib/aparencia/leitura";
import { formatPhone } from "@/lib/format";
import { ORIGEM_DO_PEDIDO_PUBLICO, type PedidoValido } from "./pedidoPublico";

/** O módulo das Solicitações: desligado, a equipe não vê a fila — e o link não recebe pedido. */
const MODULO_DAS_SOLICITACOES = "portal_solicitacoes";

/** O id do assunto no link é um uuid; outra coisa nem chega ao banco. */
const FORMA_DO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DestinoDoPedido = {
  tenantId: string;
  escritorio: { nome: string; slug: string };
  assunto: { id: string; label: string; description: string | null; sectorCode: string; responseDays: number };
};

/**
 * Para onde o link aponta, ou `null` — e a página dá 404. Nulo quando o
 * escritório não existe ou está inativo, quando as Solicitações estão
 * desligadas, e quando o assunto não é do escritório, está inativo ou não
 * aceita pedido pelo link. Os casos respondem igual de propósito: o 404 não
 * conta a quem tenta adivinhar se o assunto existe.
 *
 * `cache`: a página e os metadados fazem a mesma pergunta na mesma requisição.
 */
export const destinoDoPedido = cache(async (slug: string, assuntoId: string): Promise<DestinoDoPedido | null> => {
  if (!FORMA_DO_ID.test(assuntoId) || !slug || slug.length > 60) return null;
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, active: true } });
  if (!tenant?.active) return null;
  const [assunto, ligado] = await Promise.all([
    prisma.serviceRequestSubject.findFirst({
      where: { id: assuntoId, tenantId: tenant.id, active: true, publicLink: true },
      select: { id: true, label: true, description: true, sectorCode: true, responseDays: true },
    }),
    isModuleEnabled(tenant.id, MODULO_DAS_SOLICITACOES),
  ]);
  if (!assunto || !ligado) return null;
  return { tenantId: tenant.id, escritorio: { nome: tenant.name, slug: tenant.slug }, assunto };
});

/** O que a página pública mostra do escritório. */
export type MarcaDoPedido = { nome: string; logoUrl: string | null; corPrincipal: string | null };

/**
 * A marca do escritório na página do pedido: o nome, o logo e a cor principal
 * da Aparência do portal.
 *
 * O logo aparece sempre que existe, como no portal de vagas, na admissão e no
 * teste do candidato (padrão das páginas públicas, 08/10/2026) — quem abre o
 * link é de fora e precisa reconhecer de quem é a página. A cor é a mesma que
 * a entrada do portal usa. Nunca lança: sem aparência, vale a do Connect.
 */
export async function marcaDoPedido(tenantId: string, nome: string): Promise<MarcaDoPedido> {
  const leitura = await lerAparencia(tenantId);
  return { nome, logoUrl: leitura.escritorio.logoUrl, corPrincipal: leitura.aparencia.corPrincipal };
}

export type EmpresaDoPedido = { id: string; name: string; displayName: string | null; nova: boolean };

/**
 * A empresa do pedido: a prospecto do mesmo e-mail no escritório, ou uma
 * prospecto nova com o nome que a pessoa deu — para o mesmo interessado não
 * virar várias empresas a cada pedido.
 *
 * Só reusa **prospecto sem acesso ao portal**: o formulário é público, e quem
 * digitasse o e-mail de um cliente penduraria um pedido no cadastro dele — que
 * ele veria no portal. Cliente ativo nunca é tocado; e a prospecto reusada
 * fica como está (o nome novo vai na descrição da solicitação).
 */
export async function prospectoDoPedido(tenantId: string, p: PedidoValido): Promise<EmpresaDoPedido> {
  const prisma = getPrisma();
  const existente = await prisma.company.findFirst({
    where: { tenantId, status: "PROSPECT", email: p.email, portalUserLinks: { none: {} } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, displayName: true },
  });
  if (existente) return { ...existente, nova: false };
  const nova = await prisma.company.create({
    data: {
      tenantId,
      name: p.empresa,
      email: p.email,
      phone: formatPhone(p.telefone),
      status: "PROSPECT",
      source: ORIGEM_DO_PEDIDO_PUBLICO,
    },
    select: { id: true, name: true, displayName: true },
  });
  return { ...nova, nova: true };
}
