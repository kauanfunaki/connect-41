import type { Prisma } from "@/generated/prisma/client";
import type { HandoffPriority } from "@/generated/prisma/enums";
import type { AuthContext } from "@/lib/auth/context";
import { sectorScope } from "@/lib/auth/activeSector";
import { isFullAccess } from "@/lib/auth/papeis";
import { SITUACOES_COM_O_SETOR, whereDaSituacao } from "@/lib/handoffs";

// As abas da caixa de entrada de /transferencias (10/11/2026, escolha "B ·
// Caixa de entrada em tabela" do Kauan). Cada aba é um filtro do banco, sempre
// somado ao `scopedHandoffWhere` de quem olha — a aba recorta o que a pessoa já
// podia ver, nunca alarga. As regras moram aqui, sem Prisma de verdade (só os
// tipos), para o teste conferir cada filtro e a Home contar exatamente o que a
// aba "Para o meu setor" conta.

export type AbaDaTransferencia = "setor" | "comigo" | "enviadas" | "finalizadas";

export const ABAS_DA_TRANSFERENCIA: { chave: AbaDaTransferencia; rotulo: string }[] = [
  { chave: "setor", rotulo: "Para o meu setor" },
  { chave: "comigo", rotulo: "Comigo" },
  { chave: "enviadas", rotulo: "Enviadas" },
  { chave: "finalizadas", rotulo: "Finalizadas" },
];

/** O que as abas precisam saber de quem olha — tirado do AuthContext. */
export type QuemVeAsTransferencias = {
  userId: string;
  /** Os setores da pessoa (UserSector). */
  setores: string[];
  /** O setor ativo (subworkspace); null em "Todos os setores". */
  setorAtivo: string | null;
  /** Papel com visão do escritório inteiro (ADMIN, SUPER_ADMIN, READONLY). */
  visaoGeral: boolean;
};

/** Quem olha, a partir do AuthContext — o mesmo para a lista e para o Início. */
export function quemVeAsTransferencias(ctx: Pick<AuthContext, "userId" | "sectors" | "activeSector" | "role">): QuemVeAsTransferencias {
  return { userId: ctx.userId, setores: ctx.sectors, setorAtivo: ctx.activeSector, visaoGeral: isFullAccess(ctx.role) };
}

/**
 * Os setores de destino que a aba "Para o meu setor" olha: o setor ativo,
 * quando há um; senão os setores da pessoa; e null (todos) para quem tem visão
 * geral e está em "Todos os setores". É a mesma regra do escopo de leitura do
 * resto do app (`sectorScope`).
 *
 * O `scopedHandoffWhere` ignora o setor ativo de propósito (a transferência não
 * pode sumir ao trocar de setor). A aba pode usá-lo porque é só um recorte da
 * caixa: "Comigo", "Enviadas" e os outros setores continuam a um clique.
 */
export function setoresDaCaixa(q: QuemVeAsTransferencias): string[] | null {
  return sectorScope(q.setorAtivo, q.setores, q.visaoGeral);
}

/**
 * As abas que a pessoa vê. Sem setor nenhum na caixa (quem não é de setor e não
 * tem visão geral), "Para o meu setor" sairia sempre vazia, então não aparece.
 */
export function abasVisiveis(q: QuemVeAsTransferencias): AbaDaTransferencia[] {
  const setores = setoresDaCaixa(q);
  const temCaixa = setores === null || setores.length > 0;
  return ABAS_DA_TRANSFERENCIA.map((a) => a.chave).filter((c) => c !== "setor" || temCaixa);
}

/**
 * A aba aberta: a da URL quando é uma das visíveis; senão "Para o meu setor"
 * (o que chegou e espera alguém) ou, para quem não tem caixa de setor,
 * "Enviadas" (o que ela pediu, o único lugar em que ela aparece).
 */
export function lerAba(valor: string | undefined | null, q: QuemVeAsTransferencias): AbaDaTransferencia {
  const visiveis = abasVisiveis(q);
  if (valor && (visiveis as string[]).includes(valor)) return valor as AbaDaTransferencia;
  return visiveis[0] === "setor" ? "setor" : "enviadas";
}

/** Sentinela de "não pode ver nada": um `in: []` devolveria zero linhas por acidente. */
const NENHUM = "__none__";

/** Algum setor de destino ainda sem finalizar — devolvido incluído (está com quem pediu). */
const ALGUM_SETOR_ABERTO: Prisma.HandoffWhereInput = { sectors: { some: { status: { not: "DONE" } } } };

/**
 * A parte que está com o setor de destino: nova ou resolvendo (10/11/2026). A
 * devolvida sai de "Para o meu setor" e de "Comigo" — ela está com quem pediu
 * até ele responder e reenviar — e aparece em "Enviadas".
 */
const COM_O_SETOR = { in: SITUACOES_COM_O_SETOR };

/** O filtro do banco de cada aba — somar sempre ao `scopedHandoffWhere`. */
export function whereDaAba(aba: AbaDaTransferencia, q: QuemVeAsTransferencias): Prisma.HandoffWhereInput {
  switch (aba) {
    // Chegou para um setor da caixa e a parte está com ele (nova ou resolvendo).
    case "setor": {
      const setores = setoresDaCaixa(q);
      if (setores === null) return { sectors: { some: { status: COM_O_SETOR } } };
      return { sectors: { some: { sectorCode: { in: setores.length > 0 ? setores : [NENHUM] }, status: COM_O_SETOR } } };
    }
    // A fila pessoal: a pessoa é responsável por uma parte que está com o setor.
    case "comigo":
      return { sectors: { some: { status: COM_O_SETOR, assignees: { some: { userId: q.userId || NENHUM } } } } };
    // Pedida pela pessoa ou pelo setor dela (o ativo, quando há; senão os dela —
    // nunca "todos", que para o administrador repetiria a caixa inteira), com
    // algum setor de destino ainda sem finalizar. A devolvida entra aqui: é a
    // vez de quem pediu responder (a lista a marca com o selo "Devolvida").
    case "enviadas": {
      const origem = q.setorAtivo ? [q.setorAtivo] : q.setores;
      return {
        AND: [
          { OR: [{ requestedBy: q.userId || NENHUM }, ...(origem.length > 0 ? [{ fromSector: { in: origem } }] : [])] },
          ALGUM_SETOR_ABERTO,
        ],
      };
    }
    // Todos os setores finalizaram — a mesma regra da situação "Finalizada".
    case "finalizadas":
      return whereDaSituacao("DONE");
  }
}

/** Os filtros do botão "Filtros", já validados pela página. */
export type FiltrosDaCaixa = {
  prioridade?: HandoffPriority | null;
  /** Setor de destino. */
  setor?: string | null;
  /** Responsável por algum setor de destino. */
  responsavel?: string | null;
};

export function whereDosFiltros(f: FiltrosDaCaixa): Prisma.HandoffWhereInput[] {
  const partes: Prisma.HandoffWhereInput[] = [];
  if (f.prioridade) partes.push({ priority: f.prioridade });
  if (f.setor) partes.push({ sectors: { some: { sectorCode: f.setor } } });
  if (f.responsavel) partes.push({ sectors: { some: { assignees: { some: { userId: f.responsavel } } } } });
  return partes;
}

/**
 * A busca: no assunto, ou na empresa/pessoa da transferência — os ids que a
 * página achou pelo nome ou pelo CNPJ/CPF (a transferência guarda só
 * `entityType` + `entityId`, sem relação com Company/Person para o Prisma
 * seguir).
 */
export function whereDaBusca(termo: string, achados: { empresas: string[]; pessoas: string[] }): Prisma.HandoffWhereInput {
  return {
    OR: [
      { subject: { contains: termo } },
      ...(achados.empresas.length > 0 ? [{ entityType: "COMPANY" as const, entityId: { in: achados.empresas } }] : []),
      ...(achados.pessoas.length > 0 ? [{ entityType: "PERSON" as const, entityId: { in: achados.pessoas } }] : []),
    ],
  };
}

/** Só os dígitos da busca, quando ela parece um CNPJ/CPF (3 ou mais dígitos). */
export function digitosDaBusca(termo: string): string | null {
  const digitos = termo.replace(/\D/g, "");
  return digitos.length >= 3 ? digitos : null;
}
