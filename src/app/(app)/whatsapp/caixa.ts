// A caixa de conversas do WhatsApp do Recrutamento, do lado do servidor: quem
// pode abrir a tela, e o que a lista (o layout de /whatsapp) carrega.
//
// Desde 14/10/2026 a lista mora no layout, e não em cada página: abrir outra
// conversa troca só o painel da direita (pedido do Kauan — "a tela dá uma
// recarregada"). O layout não roda de novo ao navegar entre conversas, então
// a página da conversa confere o acesso por conta própria (`acessoAoWhatsapp`).

import { cache } from "react";
import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { listarConversas, saudeDasConexoes } from "@/lib/whatsapp/data";
import { setorDoModulo, isModuleEnabled } from "@/lib/modules";
import { pessoasDoAtendimento } from "@/lib/whatsapp/equipe";

const MODULE = "recrutamento_whatsapp";

/**
 * Módulo ligado e setor que a pessoa opera — senão, 404. Uma vez por
 * requisição: no F5, o layout e a página da conversa perguntam juntos.
 */
export const acessoAoWhatsapp = cache(async () => {
  const ctx = await getAuthContext();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? "recrutamento") : "recrutamento";
  if (!ctx.tenantId || !canActOnSector(ctx, setor)) notFound();
  return { ctx, setor };
});

/**
 * A lista inteira, sem recorte: as abas (Todas, Sem responsável, Minhas) e a
 * busca recortam no navegador, sem voltar ao servidor.
 */
export async function carregarLista() {
  const { ctx, setor } = await acessoAoWhatsapp();
  const agora = new Date();
  // Juntas: a consulta ao provedor tem timeout próprio, e a lista não espera por ela.
  const [conversas, conexoes, pessoas] = await Promise.all([
    listarConversas(ctx.tenantId, agora),
    saudeDasConexoes(ctx.tenantId, agora),
    pessoasDoAtendimento(ctx.tenantId, setor),
  ]);
  return { ctx, setor, agora, conversas, conexoes, pessoas };
}
