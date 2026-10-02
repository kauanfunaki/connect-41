import { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { prepararPerguntaDoChat, type EventoDoChat, type PedidoDoChat } from "@/lib/ia/chat/responder";
import { lerAnexos, MAX_BYTES_DOS_ANEXOS } from "@/lib/ia/chat/anexos";

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
  const tipo = req.headers.get("content-type") ?? "";
  if (tipo.startsWith("multipart/form-data")) {
    // Com anexo (02/10/2026): o arquivo é lido aqui, conferido e vai só com
    // esta pergunta — nada vai para o disco. Antes de ler, o tamanho: um
    // upload gigante não pode encher a memória para ser recusado depois.
    const tamanho = Number(req.headers.get("content-length") ?? 0);
    if (tamanho > MAX_BYTES_DOS_ANEXOS + 1024 * 1024) return erroSimples("Os arquivos passam de 10 MB juntos.", 413);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return erroSimples("Pedido inválido.", 400);
    }
    const arquivos = form.getAll("anexos").filter((x): x is File => x instanceof File && x.size > 0);
    const lidos = await lerAnexos(
      await Promise.all(arquivos.map(async (f) => ({ nome: f.name, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })))
    );
    if ("erro" in lidos) return erroSimples(lidos.erro, 400);
    corpo = {
      conversaId: form.get("conversaId") || undefined,
      agentCode: form.get("agentCode") ?? undefined,
      pergunta: form.get("pergunta") ?? undefined,
      caminho: form.get("caminho") ?? undefined,
      anexos: lidos.anexos,
    };
  } else {
    try {
      // `anexos` só entra pelo upload conferido acima: no JSON, é descartado.
      corpo = { ...((await req.json()) as PedidoDoChat), anexos: undefined };
    } catch {
      return erroSimples("Pedido inválido.", 400);
    }
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
