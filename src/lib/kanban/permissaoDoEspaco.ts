// A permissão de um espaço dos Quadros (05/11/2026, pedido do Kauan, no modelo
// do ClickUp). Substitui o interruptor por setor de 28/10, que só ligava e
// desligava a criação de tarefas pelos colaboradores.
//
// Cada espaço tem uma permissão padrão, que vale para quem é do setor sem
// coordená-lo (o colaborador, SECTOR_USER):
//
//   Edição total — cria e edita tarefas e listas, mexe nas colunas e cria pastas.
//   Editar       — cria e edita tarefas e listas e mexe nas colunas; não cria pasta.
//                  É o que o colaborador fazia com o setor liberado, e o padrão.
//   Comentário   — vê e comenta (e acompanha), sem editar nada.
//                  Era o setor bloqueado: a migration levou os espaços para cá.
//   Apenas exibição — só vê.
//
// Fora do nível:
//   - o coordenador do setor e o administrador fazem tudo, e só eles mudam as
//     configurações do espaço (nome, ícone, cor, descrição, permissão);
//   - excluir — espaço, pasta, lista, tarefa, comentário — continua só com o
//     administrador (`podeExcluir`, 13/10/2026);
//   - a Diretoria (READONLY) e a assinatura em somente leitura só veem;
//   - quem não é do setor nem vê.
//
// Não há "Tornar privado": os Quadros não têm acesso externo, e quem vê é quem
// é do setor.
//
// Só regra: sem banco, para o teste e para servir à tela e às ações.

import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector, canViewSector, podeExcluir } from "@/lib/auth/papeis";

export const PERMISSOES_DO_ESPACO = ["TOTAL", "EDITAR", "COMENTAR", "EXIBIR"] as const;
export type PermissaoDoEspaco = (typeof PERMISSOES_DO_ESPACO)[number];

/** A permissão de um espaço novo: a mesma do colaborador com o setor liberado. */
export const PERMISSAO_PADRAO: PermissaoDoEspaco = "EDITAR";

export const ROTULO_DA_PERMISSAO: Record<PermissaoDoEspaco, string> = {
  TOTAL: "Edição total",
  EDITAR: "Editar",
  COMENTAR: "Comentário",
  EXIBIR: "Apenas exibição",
};

/** A frase que a janela mostra embaixo da escolha — o que o colaborador faz. */
export const DESCRICAO_DA_PERMISSAO: Record<PermissaoDoEspaco, string> = {
  TOTAL: "Os colaboradores criam e editam tarefas e listas, mexem nas colunas e criam pastas.",
  EDITAR: "Os colaboradores criam e editam tarefas e listas e mexem nas colunas, sem criar pastas.",
  COMENTAR: "Os colaboradores veem e comentam, sem editar.",
  EXIBIR: "Os colaboradores só veem.",
};

/** O que vale para todo nível — fica junto da escolha, para não parecer que muda. */
export const REGRA_FIXA_DO_ESPACO =
  "A coordenação e os administradores gerenciam o espaço em qualquer nível. Excluir é só do administrador.";

export function lerPermissao(valor: unknown): PermissaoDoEspaco | null {
  return typeof valor === "string" && (PERMISSOES_DO_ESPACO as readonly string[]).includes(valor)
    ? (valor as PermissaoDoEspaco)
    : null;
}

type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

export type PoderesNoEspaco = {
  /** Abre o espaço, as pastas, as listas e as tarefas. */
  ver: boolean;
  /** Comenta numa tarefa e se marca como participante. */
  comentar: boolean;
  /**
   * Cria tarefa e lista, edita os campos da tarefa (status, datas, responsáveis,
   * prioridade, etiquetas, descrição, subtarefas, checklist, vínculos, anexos,
   * tempo), move e reordena, e mexe nas colunas da lista.
   */
  editar: boolean;
  /** Cria pasta no espaço. */
  criarPasta: boolean;
  /** Muda nome, ícone, cor, descrição e permissão do espaço. */
  gerenciar: boolean;
  /** Exclui — só o administrador. */
  excluir: boolean;
};

const NADA: PoderesNoEspaco = { ver: false, comentar: false, editar: false, criarPasta: false, gerenciar: false, excluir: false };

export function poderesNoEspaco(
  ctx: Quem,
  espaco: { sectorCode: string; defaultPermission: PermissaoDoEspaco },
): PoderesNoEspaco {
  if (!canViewSector(ctx, espaco.sectorCode)) return NADA;
  const soVer = { ...NADA, ver: true };
  // Diretoria e assinatura em somente leitura: canActOnSector já recusa.
  if (!canActOnSector(ctx, espaco.sectorCode)) return soVer;

  const excluir = podeExcluir(ctx);
  if (canManageSector(ctx, espaco.sectorCode)) {
    return { ver: true, comentar: true, editar: true, criarPasta: true, gerenciar: true, excluir };
  }

  // Daqui para baixo, o colaborador do setor. `excluir` vem do papel — só o
  // administrador exclui, e ele já saiu acima —, então aqui é sempre falso.
  switch (espaco.defaultPermission) {
    case "TOTAL":
      return { ver: true, comentar: true, editar: true, criarPasta: true, gerenciar: false, excluir };
    case "EDITAR":
      return { ver: true, comentar: true, editar: true, criarPasta: false, gerenciar: false, excluir };
    case "COMENTAR":
      return { ...soVer, comentar: true };
    case "EXIBIR":
    default:
      return soVer;
  }
}
