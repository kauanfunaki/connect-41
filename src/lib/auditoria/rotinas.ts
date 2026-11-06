// As rotinas do sistema que agem sem pessoa (05/11/2026). Até aqui gravavam a
// trilha sem usuário e sem nome, e a Auditoria as mostrava como "Usuário sem
// nome (excluído)" — o robô do Societário apareceu assim ao ler a situação da
// IE no CICAD. Agora o nome da rotina vai em `actorName`, e a tela sabe que não
// é gente excluída.

export const ROTINAS_DO_SISTEMA = {
  roboDoSocietario: "Robô do Societário",
  agendadorDeEnvios: "Agendador de envios",
  repeticaoDeLancamentos: "Repetição de lançamentos",
  // A máquina do motor que gera o SPED pela fila do Connect (06/11/2026).
  agenteDoSped: "Agente do SPED",
} as const;

export type RotinaDoSistema = keyof typeof ROTINAS_DO_SISTEMA;

/** O nome das linhas antigas de rotina, gravadas sem nome nenhum. */
export const NOME_DO_SISTEMA = "Sistema";

const NOMES = new Set<string>(Object.values(ROTINAS_DO_SISTEMA));

/**
 * A linha veio de uma rotina, não de uma pessoa. Sem usuário e sem nome só
 * pode ser rotina: toda ação de pessoa grava o nome (o nome do usuário é
 * obrigatório, e as linhas de antes de 13/10/2026 ganharam o nome no backfill).
 */
export function ehRotinaDoSistema(l: { userId: string | null; actorName: string | null }): boolean {
  if (l.userId) return false;
  return !l.actorName || NOMES.has(l.actorName);
}

/** Quem agiu, para a trilha: a pessoa quando há uma, senão a rotina. */
export function pessoaOuRotina(userId: string | null | undefined, rotina: RotinaDoSistema): { userId: string } | { rotina: RotinaDoSistema } {
  return userId ? { userId } : { rotina };
}
