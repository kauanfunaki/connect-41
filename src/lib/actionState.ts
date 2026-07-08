// Tipo único de retorno das Server Actions de formulário. Antes cada arquivo
// definia o seu (`PessoaState`, `CandidaturaState`, `UsuarioState`…) — todos
// idênticos. Mantidos como aliases para não quebrar imports existentes.
export type ActionState = { error: string } | null;
