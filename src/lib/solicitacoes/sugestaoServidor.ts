// Quando o botão "Sugestão ou problema" aparece no portal (21/10/2026): com as
// solicitações ligadas e liberadas para os clientes, e sem o escritório ter
// desativado o assunto da sugestão em Assuntos das solicitações.

import { getPrisma } from "@/lib/prisma";
import { ASSUNTO_DA_SUGESTAO } from "./sugestao";

export async function sugestaoLigada(tenantId: string, modulos: ReadonlySet<string>, bloqueadas: ReadonlySet<string>): Promise<boolean> {
  if (!modulos.has("portal_solicitacoes") || bloqueadas.has("/portal/solicitacoes")) return false;
  const assunto = await getPrisma().serviceRequestSubject.findFirst({
    where: { tenantId, label: ASSUNTO_DA_SUGESTAO.label },
    select: { active: true },
  });
  // Sem o assunto, ele nasce na primeira sugestão.
  return !assunto || assunto.active;
}
