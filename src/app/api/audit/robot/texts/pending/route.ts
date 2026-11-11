import { atenderRobo, validar } from "@/lib/honorarios/robo";
import { proximoJobSchema } from "@/lib/honorarios/regras/auditPayload";
import { textosPendentes } from "@/lib/honorarios/servidor/auditTextosService";

export const runtime = "nodejs";

// Os contratos e aditivos (PDF/DOCX das pastas vinculadas) que ainda não têm texto. 204 = nada a ler.
export async function POST(request: Request) {
  return atenderRobo(request, async (corpo) => {
    const { host, versao } = validar(proximoJobSchema, corpo);
    return textosPendentes(host, versao ?? null);
  });
}
