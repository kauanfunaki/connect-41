import { getAuthContext } from "@/lib/auth/context";
import { contarNaoLidasVisiveis, marcoDasNotificacoes, notificacoesNovas, tiposOcultos } from "@/lib/notificacoes/consultas";
import { MAXIMO_DE_AVISOS, cursorDepois, lerDesde, type RespostaDasNovas } from "@/lib/notificacoes/avisoNaTela";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A conferência do sino (09/11/2026): o número de não lidas e as que chegaram
// depois do `desde`, para virar aviso no canto da tela. Sem `desde` é a
// primeira conferência da página: nada vira aviso, e o cursor volta na
// notificação mais nova da pessoa — o que já existia ao abrir a página.
//
// Rota com JSON, e não a Server Action de antes: roda em segundo plano, e uma
// action no meio de uma navegação pode desfazer um filtro recém-aplicado (o
// mesmo motivo do alerta de reunião). Só a própria pessoa: tudo filtra por
// escritório e usuário, e o tipo oculto nas preferências não vem.
export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  const desde = lerDesde(new URL(request.url).searchParams.get("desde"));
  const ocultos = await tiposOcultos(dono);
  const [naoLidas, novas, marco] = await Promise.all([
    contarNaoLidasVisiveis(dono, ocultos),
    desde ? notificacoesNovas(dono, desde, ocultos, MAXIMO_DE_AVISOS) : Promise.resolve([]),
    desde ? Promise.resolve(null) : marcoDasNotificacoes(dono),
  ]);
  const resposta: RespostaDasNovas = {
    naoLidas,
    novas,
    cursor: desde ? cursorDepois(desde.toISOString(), novas) : (marco ?? new Date(0)).toISOString(),
  };
  return Response.json(resposta, { headers: { "Cache-Control": "private, no-store" } });
}
