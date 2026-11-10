// A Agenda de cada setor e de cada pessoa (10/11/2026, pedido do Kauan).
//
// "Agenda e Meu dia usam as reuniões, mas tem setores que não fazem reuniões…
// quero algo mais único para enquadrar a realidade de cada setor." Decisões:
//
// - cada setor diz se USA REUNIÕES (padrão: sim, para nada mudar para quem
//   usa). Quem diz é o coordenador do setor (SECTOR_ADMIN dele), o Admin ou o
//   Super Admin. O setor que não usa abre a Agenda em Prazos, não mostra o
//   "Nova reunião" fora das visões de horário, e o Meu dia nasce sem
//   "Próximas reuniões";
// - as FONTES de prazo (fontesDaAgenda.ts) que a Agenda mostra: a pessoa liga e
//   desliga, e a escolha fica gravada para ela; quem nunca escolheu vê o padrão
//   do setor, e sem ele, todas;
// - a ÚLTIMA VISÃO que a pessoa escolheu (Prazos, Dia, Semana ou Mês) é a que
//   a Agenda abre da próxima vez.
//
// A precedência é sempre pessoa > setor > código. Quem está em mais de um
// setor soma (como no Meu dia): usa reuniões se algum setor dele usa, e vê a
// fonte que algum setor dele mostra. Quem não é de setor nenhum (Admin, Super
// Admin) vê a Agenda de antes: com reuniões e todas as fontes.
//
// "Usa reuniões" por pessoa ficou de fora de propósito: tudo o que ele mudaria
// já é escolha da pessoa — a visão em que a Agenda abre (a última que ela
// escolheu) e o bloco "Próximas reuniões" no Meu dia (o Configurar dela). Um
// terceiro interruptor só mandaria nos dois de uma vez, e brigaria com eles.
//
// Puro, sem banco: a leitura está em agendaDoSetorServidor.ts.

import type { AgendaView } from "@/lib/agenda";
import { FONTES_DA_AGENDA, type FonteDaAgenda } from "@/lib/fontesDaAgenda";

export type AgendaDoSetor = {
  usaReunioes: boolean;
  /** `null`: o setor nunca escolheu — todas as fontes. */
  fontesOcultas: FonteDaAgenda[] | null;
};

export type AgendaDaPessoa = {
  /** `null`: segue o setor. */
  fontesOcultas: FonteDaAgenda[] | null;
  /** `null`: nunca escolheu — vale a do setor. */
  visao: AgendaView | null;
};

/** O setor sem linha no banco: a Agenda de antes de 10/11/2026. */
export const AGENDA_DO_SETOR_PADRAO: AgendaDoSetor = { usaReunioes: true, fontesOcultas: null };

export type AgendaPorSetor = Readonly<Record<string, AgendaDoSetor>>;

/** Um setor na tela de configuração: o que vale hoje e se há o que restaurar. */
export type AgendaDoSetorNaTela = {
  code: string;
  rotulo: string;
  usaReunioes: boolean;
  fontesOcultas: FonteDaAgenda[];
  /** O setor tem configuração gravada. */
  personalizado: boolean;
};

/** Os setores dados como a tela de configuração os mostra. */
export function agendaDosSetoresNaTela(setores: readonly { code: string; label: string }[], porSetor: AgendaPorSetor): AgendaDoSetorNaTela[] {
  return setores.map((s) => {
    const gravado = porSetor[s.code];
    return {
      code: s.code,
      rotulo: s.label,
      usaReunioes: (gravado ?? AGENDA_DO_SETOR_PADRAO).usaReunioes,
      fontesOcultas: gravado?.fontesOcultas ?? [],
      personalizado: gravado !== undefined,
    };
  });
}

/** Se a pessoa (pelos setores dela) usa reuniões. Sem setor: sim. */
export function usaReunioes(setores: readonly string[], porSetor: AgendaPorSetor): boolean {
  if (setores.length === 0) return true;
  return setores.some((s) => (porSetor[s] ?? AGENDA_DO_SETOR_PADRAO).usaReunioes);
}

/**
 * As fontes que o padrão dos setores esconde: só as que TODOS os setores da
 * pessoa escondem. Quem está no Fiscal (que esconde Contas) e no BPO (que
 * mostra) precisa ver as contas — a soma, como os blocos do Meu dia.
 */
export function ocultasDosSetores(setores: readonly string[], porSetor: AgendaPorSetor): FonteDaAgenda[] {
  if (setores.length === 0) return [];
  const listas = setores.map((s) => porSetor[s]?.fontesOcultas ?? []);
  return FONTES_DA_AGENDA.map((f) => f.chave).filter((f) => listas.every((l) => l.includes(f)));
}

/** De onde veio a escolha das fontes: a tela diz "Salvo para você" ou "Padrão do setor". */
export type OrigemDasFontes = "pessoa" | "setor" | "codigo";

export type FontesDaPessoa = { ocultas: FonteDaAgenda[]; origem: OrigemDasFontes };

/** As fontes escondidas para a pessoa: a escolha dela; sem ela, o padrão dos setores; sem ele, nenhuma. */
export function fontesOcultasDaPessoa(
  pessoa: AgendaDaPessoa | null,
  setores: readonly string[],
  porSetor: AgendaPorSetor,
): FontesDaPessoa {
  if (pessoa?.fontesOcultas != null) return { ocultas: pessoa.fontesOcultas, origem: "pessoa" };
  const configurou = setores.some((s) => porSetor[s]?.fontesOcultas != null);
  return { ocultas: ocultasDosSetores(setores, porSetor), origem: configurou ? "setor" : "codigo" };
}

/**
 * A visão em que a Agenda abre sem `?view=` no endereço: a última que a pessoa
 * escolheu; sem ela, Prazos para quem não usa reuniões e Semana para quem usa
 * (a de sempre).
 */
export function visaoInicial(pessoa: AgendaDaPessoa | null, usa: boolean): AgendaView {
  return pessoa?.visao ?? (usa ? "semana" : "prazos");
}

/** As fontes que ficam ligadas: as que a pessoa alcança menos as escondidas. */
export function fontesLigadas(acessiveis: readonly FonteDaAgenda[], ocultas: readonly FonteDaAgenda[]): FonteDaAgenda[] {
  const fora = new Set(ocultas);
  return acessiveis.filter((f) => !fora.has(f));
}

/**
 * A lista que se grava quando a pessoa liga ou desliga uma fonte: a que ela vê
 * agora (a dela, ou a herdada do setor), com a troca. A partir daí é dela, e o
 * padrão do setor deixa de valer até "Restaurar padrão".
 */
export function alternarFonte(ocultas: readonly FonteDaAgenda[], fonte: FonteDaAgenda, ligada: boolean): FonteDaAgenda[] {
  const nova = new Set(ocultas);
  if (ligada) nova.delete(fonte);
  else nova.add(fonte);
  return FONTES_DA_AGENDA.map((f) => f.chave).filter((f) => nova.has(f));
}
