// O portão antes da chamada paga (20/10/2026).
//
// Chamar o Serpro em nome de um cliente sem Autorização de Acesso válida para
// o serviço volta 403 — e o 403 é cobrado. Antes de cada chamada paga, o
// `chamarSerpro` pergunta aqui: lê a autorização da raiz do cliente e só deixa
// passar a ativa (ou a renovar) que cobre o serviço. Os serviços que não
// exigem autorização (PGMEI, Sicalc, Procurações) passam direto, sem consulta.
// A regra é pura, em `autorizacaoPermite` (servicos.ts); aqui só o banco.

import { getPrisma } from "@/lib/prisma";
import { hojeIso } from "@/lib/datas/calendario";
import { autorizacaoPermite, chaveDoContribuinte, type Portao, type ServicoDoSerpro } from "./servicos";

const paraIso = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export async function podeChamar(tenantId: string, documento: string, servico: ServicoDoSerpro, hoje = hojeIso()): Promise<Portao> {
  if (servico.autorizacao.length === 0) return { pode: true };
  const r = await getPrisma().accessAuthorization.findUnique({
    where: { tenantId_documento: { tenantId, documento: chaveDoContribuinte(documento) } },
    select: { status: true, requestedAt: true, receivedAt: true, validatedAt: true, expiresAt: true, allServices: true, services: true },
  });
  return autorizacaoPermite(
    servico,
    r
      ? {
          status: r.status,
          requestedAt: paraIso(r.requestedAt),
          receivedAt: paraIso(r.receivedAt),
          validatedAt: paraIso(r.validatedAt),
          expiresAt: paraIso(r.expiresAt),
          allServices: r.allServices,
          services: r.services,
        }
      : null,
    hoje
  );
}
