// A situação do vínculo do colaborador (`employmentStatus`) em palavras e no
// tom do `Selo` — a coluna "Situação" de Colaboradores de clientes.
//
// Os tons seguem a regra do `Selo`: o que pede ação do DP em âmbar (admissão
// em andamento, afastado), o que está em dia em verde, férias no azul da
// marca, e o encerrado (desligado) em neutro.

import type { PersonEmploymentStatus } from "@/generated/prisma/enums";
import type { TomDoSelo } from "@/components/ui/Selo";

export const SITUACAO_DO_VINCULO: Record<PersonEmploymentStatus, { rotulo: string; tom: TomDoSelo }> = {
  ATIVO: { rotulo: "Ativo", tom: "sucesso" },
  ADMISSAO_EM_ANDAMENTO: { rotulo: "Admissão em andamento", tom: "atencao" },
  EM_FERIAS: { rotulo: "Em férias", tom: "marca" },
  AFASTADO: { rotulo: "Afastado", tom: "atencao" },
  DESLIGADO: { rotulo: "Desligado", tom: "neutro" },
};
