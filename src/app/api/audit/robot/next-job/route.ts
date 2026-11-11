import { atenderRobo, validar } from "@/lib/honorarios/robo";
import { proximoJobSchema } from "@/lib/honorarios/regras/auditPayload";
import { proximoTrabalho } from "@/lib/honorarios/servidor/auditSyncService";

export const runtime = "nodejs";

// O robô pergunta se há varredura a fazer (e dá sinal de vida). 204 = nada.
export async function POST(request: Request) {
  return atenderRobo(request, async (corpo) => {
    const { host, versao } = validar(proximoJobSchema, corpo);
    return proximoTrabalho(host, versao ?? null);
  });
}
