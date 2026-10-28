// O que conta como admissão em andamento e desligamento em processo (lote 6,
// 28/10/2026). A Home e o hub Colaboradores mostram os mesmos números e
// montavam cada um a sua consulta; o levantamento das telas repetidas achou
// as duas iguais por acaso. Agora as duas leem daqui.

import type { Prisma } from "@/generated/prisma/client";

export const ADMISSAO_EM_ANDAMENTO = {
  type: "COLABORADOR",
  employmentStatus: "ADMISSAO_EM_ANDAMENTO",
} as const satisfies Prisma.PersonWhereInput;

export const DESLIGAMENTO_EM_PROCESSO = {
  status: { notIn: ["FINALIZADO", "CANCELADO"] },
} as const satisfies Prisma.TerminationWhereInput;
