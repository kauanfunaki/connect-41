import { contexto } from "@/lib/chamados/contexto";
import { enviarAnexo } from "@/lib/chamados/anexos";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const c = await contexto();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && new URL(origin).host !== request.headers.get("x-forwarded-host")) return Response.json({ error: "Origem inválida." }, { status: 403 });
    return Response.json(await enviarAnexo(c, await request.formData()));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Não foi possível enviar o arquivo." }, { status: 400 });
  }
}
