import { z } from "zod";
import { cenarioSchema } from "@/lib/fiscal/previa/cenario";

const id = z.string().min(1).max(200);
const texto = z.string().max(2000);
const imposto = z.enum(["ICMS/IPI", "Contribuições"]);
const porId = ["recuperar", "remover-ajuste", "validar", "entregar", "processar", "cancelar", "reprocessar", "conciliar"] as const;
export const acaoFiscalLocalSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("restaurar") }),
  z.object({ tipo: z.literal("contexto"), contexto: cenarioSchema.shape.contexto }),
  z.object({ tipo: z.literal("importar"), origem: texto }),
  z.object({ tipo: z.literal("classificar"), ids: z.array(id).max(1000), destino: texto, credito: z.boolean(), cst: texto }),
  ...porId.map((tipo) => z.object({ tipo: z.literal(tipo), id })),
  z.object({ tipo: z.literal("apurar") }), z.object({ tipo: z.literal("fechar") }),
  z.object({ tipo: z.literal("ajuste"), imposto, codigo: texto, descricao: texto, valor: z.number().finite().positive(), efeito: z.enum(["Débito", "Crédito"]), obrigacao: texto }),
  z.object({ tipo: z.literal("parametros"), parametros: z.object({ icms: z.number().min(0).max(100), ipi: z.number().min(0).max(100), pis: z.number().min(0).max(100), cofins: z.number().min(0).max(100) }) }),
  z.object({ tipo: z.literal("empresa"), nome: texto.min(1), regime: texto }),
  z.object({ tipo: z.literal("regra"), regra: cenarioSchema.shape.regras.element }),
  z.object({ tipo: z.literal("gerar"), imposto }),
  z.object({ tipo: z.literal("enfileirar"), imposto, falhar: z.boolean() }),
  z.object({ tipo: z.literal("confrontar") }),
  z.object({ tipo: z.literal("favoritar"), empresaId: id }),
]);
