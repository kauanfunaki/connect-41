// O esquema da meta pessoal (zod), separado da regra em 13/11/2026 (Controle
// interno melhoria-661). `metas.ts` entra no menu de toda tela (AppShell →
// AcademiaNoTopo → MetaPessoal), e o zod que vinha junto pesava ~110 KB no JS
// de todas elas. Quem confere a meta é o servidor (`metaServidor.ts`): o
// esquema mora aqui, e o cliente só lê as constantes de `metas.ts`.

import { z } from "zod";
import { ALVO_MAXIMO, UNIDADE_DA_META } from "./metas";
import { NIVEIS, ROTULO_DO_TESTE, TESTES } from "./regras";

export const metaSchema = z
  .object({
    teste: z.enum(TESTES, { error: "Escolha o teste." }),
    nivel: z.enum(NIVEIS).nullable().default(null),
    alvo: z.coerce.number({ error: "Escreva o alvo." }).int("Use um número inteiro.").min(1, "O alvo precisa ser maior que zero."),
    prazo: z.string({ error: "Escolha o prazo." }).regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha o prazo."),
  })
  .superRefine((m, ctx) => {
    if (m.alvo > ALVO_MAXIMO[m.teste]) ctx.addIssue({ code: "custom", path: ["alvo"], message: `Em ${ROTULO_DO_TESTE[m.teste]}, o alvo vai até ${ALVO_MAXIMO[m.teste]} ${UNIDADE_DA_META[m.teste]}.` });
  });
export type MetaParaGravar = z.output<typeof metaSchema>;
