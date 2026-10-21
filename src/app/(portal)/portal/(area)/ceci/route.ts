import { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { prepararPerguntaDoPortal, type EventoDoPortal, type PedidoDoPortal } from "@/lib/ia/portal/responder";

export const dynamic = "force-dynamic";

// A pergunta da Ceci no portal do cliente (21/10/2026, fase 3). Responde em
// NDJSON — uma linha JSON por evento — como o chat da equipe (`/api/ia/chat`),
// para a tela mostrar o passo enquanto a Ceci consulta. O miolo mora em
// `src/lib/ia/portal/responder.ts`.
//
// Só JSON: sem anexo no portal, por ora. O cookie do portal é `SameSite=Lax`,
// então um formulário de outro site não chega aqui com a sessão.

function erroSimples(texto: string, status: number) {
  return new Response(JSON.stringify({ tipo: "erro", texto }) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const sessao = await sessaoAtivaDoPortal();
  if (!sessao) return erroSimples("Sua sessão expirou. Entre de novo.", 401);
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return erroSimples("Pedido inválido.", 400);

  let corpo: PedidoDoPortal;
  try {
    corpo = (await req.json()) as PedidoDoPortal;
  } catch {
    return erroSimples("Pedido inválido.", 400);
  }

  const conta = await getPrisma().portalUser.findFirst({
    where: { id: sessao.sub, tenantId: sessao.tenantId, active: true },
    select: { name: true },
  });
  if (!conta) return erroSimples("Sua sessão expirou. Entre de novo.", 401);

  const preparo = await prepararPerguntaDoPortal({ tenantId: sessao.tenantId, portalUserId: sessao.sub, nome: conta.name }, corpo);
  if ("erro" in preparo) return erroSimples(preparo.erro, preparo.status);

  const codificador = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (e: EventoDoPortal) => {
        try {
          controller.enqueue(codificador.encode(JSON.stringify(e) + "\n"));
        } catch {
          // O cliente fechou o chat no meio: a execução termina e o custo fica registrado.
        }
      };
      try {
        await preparo.executar(enviar);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Proxy na frente (EasyPanel/Traefik) não pode segurar o corpo até o fim.
      "X-Accel-Buffering": "no",
    },
  });
}
