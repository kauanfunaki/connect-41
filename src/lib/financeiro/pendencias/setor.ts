// De qual setor é uma pendência (01/10).
//
// Até 01/10 a pendência era só do BPO: o módulo `bpo_pendencias` dizia o setor
// de todas. Com o portal virando o caminho único com o cliente, qualquer setor
// pede — e a pendência passa a guardar quem pediu. As de antes ficam com setor
// nulo e continuam sendo do setor do módulo, então a tela, o painel, a agenda e
// a IA do BPO filtram "o do módulo ou nenhum" e não mudam em nada.

import type { Prisma } from "@/generated/prisma/client";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";

export const MODULO_DAS_PENDENCIAS = "bpo_pendencias";
/** O canal do portal (solicitações): com ele, qualquer setor pede ao cliente. */
export const MODULO_DO_CANAL = "portal_solicitacoes";

/** O setor das pendências sem setor: o que opera o módulo neste tenant. */
export async function setorPadraoDasPendencias(tenantId: string): Promise<string> {
  return (await setorDoModulo(tenantId, MODULO_DAS_PENDENCIAS)) ?? getModuleDef(MODULO_DAS_PENDENCIAS)!.sectorCode;
}

export function setorDaPendencia(sectorCode: string | null, padrao: string): string {
  return sectorCode ?? padrao;
}

/** Os pedidos ao cliente valem com o módulo do BPO ou com o canal do portal. */
export function pedidosAoClienteNoConjunto(modulos: ReadonlySet<string>): boolean {
  return modulos.has(MODULO_DAS_PENDENCIAS) || modulos.has(MODULO_DO_CANAL);
}

export async function pedidosAoClienteLigados(tenantId: string): Promise<boolean> {
  return (await isModuleEnabled(tenantId, MODULO_DAS_PENDENCIAS)) || (await isModuleEnabled(tenantId, MODULO_DO_CANAL));
}

/** Recorte por setor: os códigos e se as pendências sem setor (as antigas, do setor padrão) entram. */
export type RecorteDeSetor = { codigos: string[]; incluiSemSetor: boolean };

/** Só o setor padrão — o que a tela, o painel, a agenda e a IA do BPO sempre mostraram. */
export function soDoSetorPadrao(padrao: string): RecorteDeSetor {
  return { codigos: [padrao], incluiSemSetor: true };
}

/** Os setores que a pessoa enxerga; as sem setor entram se ela enxerga o padrão. */
export function dosSetores(codigos: string[], padrao: string): RecorteDeSetor {
  return { codigos, incluiSemSetor: codigos.includes(padrao) };
}

export function whereDoRecorteDeSetor(r: RecorteDeSetor): Prisma.ClientRequestWhereInput {
  const ou: Prisma.ClientRequestWhereInput[] = [{ sectorCode: { in: r.codigos } }];
  if (r.incluiSemSetor) ou.push({ sectorCode: null });
  return { OR: ou };
}
