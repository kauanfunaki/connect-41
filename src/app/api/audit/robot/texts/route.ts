import { atenderRobo, validar } from "@/lib/honorarios/robo";
import { textosSchema } from "@/lib/honorarios/regras/auditPayload";
import { receberTextos } from "@/lib/honorarios/servidor/auditTextosService";

export const runtime = "nodejs";

// O texto que o robô extraiu; o leitor do honorário roda na hora.
export async function POST(request: Request) {
  return atenderRobo(request, async (corpo) => {
    const { textos } = validar(textosSchema, corpo);
    return receberTextos(textos, null);
  });
}
