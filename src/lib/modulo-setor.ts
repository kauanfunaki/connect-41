// Qual setor opera um módulo num tenant.
//
// O catálogo diz onde o módulo nasce (o DRE é do BPO), mas quem opera varia de
// cliente para cliente: numa empresa o DRE é do Financeiro. O ajuste mora em
// `TenantModule.sectorCode`, e esta é a única regra que o lê — sidebar, rota do
// setor, `/admin/modulos` e o gate de cada tela passam por aqui, para que um
// módulo transferido nunca apareça num setor e abra noutro.
//
// Função pura e separada de `modules.ts` porque aquele arquivo toca o banco.

/** O setor efetivo: o transferido, quando houver; senão o do catálogo. */
export function resolverSetorDoModulo(setorDoCatalogo: string, setorDoTenant: string | null | undefined): string {
  const transferido = setorDoTenant?.trim();
  return transferido ? transferido : setorDoCatalogo;
}

/**
 * O valor a gravar em `TenantModule.sectorCode` para um setor escolhido na tela.
 *
 * Escolher de volta o setor do catálogo grava `null`, e não o código: assim, se
 * o catálogo mudar o setor de origem de um módulo, quem nunca transferiu segue o
 * catálogo em vez de ficar preso ao valor antigo.
 */
export function setorParaGravar(setorDoCatalogo: string, escolhido: string): string | null {
  const s = escolhido.trim();
  return s === "" || s === setorDoCatalogo ? null : s;
}
