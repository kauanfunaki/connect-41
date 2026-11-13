// Os esquemas (zod) do que o robô e a tela mandam para a sessão assistida,
// separados da regra em 13/11/2026 (Controle interno melhoria-661). A regra
// (`assistencia.ts`) entra no menu de toda tela pela chamada do robô
// (ChamadaDoRobo → AssistenciaAoVivo), e o zod que vinha junto pesava ~110 KB
// no JS de todas elas. Quem confere estes corpos são as rotas da API.

import { z } from "zod";
import { FINS_DA_ASSISTENCIA, MOTIVOS_DA_ASSISTENCIA, type Clique } from "./assistencia";

export const pedidoDeAssistenciaSchema = z.object({ motivo: z.enum(MOTIVOS_DA_ASSISTENCIA) });
export const fimDaAssistenciaSchema = z.object({ resultado: z.enum(FINS_DA_ASSISTENCIA) });

/** Onde a pessoa clicou, em fração do quadro (0 a 1): o robô converte para a janela dele. */
export const cliqueSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }) satisfies z.ZodType<Clique>;
