import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { prepararPerguntaDoChat, type EventoDoChat, type PedidoDoChat } from "@/lib/ia/chat/responder";

export const dynamic = "force-dynamic";

// A pergunta do chat de IA do canto da tela. Responde em NDJSON — uma linha
// JSON por evento — para a tela mostrar o passo enquanto o agente trabalha. O
// miolo mora em `src/lib/ia/chat/responder.ts`.

function erroSimples(texto: string, status: number) {
  return new Response(JSON.stringify({ tipo: "erro", texto }) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  let corpo: PedidoDoChat;
  try {
    corpo = await req.json();
  } catch {
    return erroSimples("Pedido inválido.", 400);
  }
  const preparo = await prepararPerguntaDoChat(ctx, corpo);
  if ("erro" in preparo) return erroSimples(preparo.erro, preparo.status);

  const codificador = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enviar = (e: EventoDoChat) => {
        try {
          controller.enqueue(codificador.encode(JSON.stringify(e) + "\n"));
        } catch {
          // A pessoa fechou o chat no meio: a resposta segue sendo gravada.
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
