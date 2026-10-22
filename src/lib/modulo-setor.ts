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
export function resolverSetorDoModulo(setorDoCatalogo: string, setorDoTenant: string | null | undefined, fixo = false): string {
  if (fixo) return setorDoCatalogo;
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

/**
 * Os setores de uma tela (21/10/2026): o dono primeiro, depois os que também
 * usam, sem repetir e sem vazio. Um setor ligado que virou o dono (a tela foi
 * movida para ele) conta uma vez só.
 */
export function resolverSetoresDoModulo(setorDono: string, setoresLigados: readonly (string | null | undefined)[]): string[] {
  const setores = [setorDono];
  for (const s of setoresLigados) {
    const codigo = s?.trim();
    if (codigo && !setores.includes(codigo)) setores.push(codigo);
  }
  return setores;
}

/**
 * O que gravar como setores a mais de uma tela, a partir do que o
 * administrador marcou: só setores ativos, sem o dono e sem repetir.
 */
export function setoresParaLigar(setorDono: string, marcados: readonly string[], ativos: readonly string[]): string[] {
  return resolverSetoresDoModulo(setorDono, marcados.filter((s) => ativos.includes(s.trim()))).slice(1);
}

/**
 * Em qual dos setores da tela ela aparece numa lista agrupada por setor (a
 * Ajuda, por exemplo), para não repetir: o setor escolhido no alto da tela, se
 * for um deles; senão o primeiro que é da pessoa; senão o dono.
 */
export function setorParaMostrar(setores: readonly string[], quem: { activeSector: string | null; sectors: readonly string[] }): string {
  return (
    (quem.activeSector && setores.includes(quem.activeSector) ? quem.activeSector : undefined) ??
    setores.find((s) => quem.sectors.includes(s)) ??
    setores[0]
  );
}
