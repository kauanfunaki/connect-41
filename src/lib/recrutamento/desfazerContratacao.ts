/**
 * "Desfazer contratação" (decisão do Kauan, 30/10/2026: desfazer com trava).
 *
 * Contratar pelo funil faz a pessoa virar colaboradora da empresa da vaga, em
 * admissão, ligada ao cargo — e trava o cartão. Desfazer devolve tudo isso:
 * a pessoa volta a candidata, sem empresa e sem cargo, e a candidatura volta à
 * Proposta (a etapa antes de Contratado; não há histórico de etapas).
 *
 * A trava: só se desfaz a contratação que ainda não andou. Depois que o DP
 * gerou o link de admissão, a pessoa pode ter mandado dados e documentos — e
 * desfazer apagaria o trabalho do DP. Também não se desfaz quando a pessoa já
 * está ativa ou tem data de admissão (já era colaboradora antes, ou o DP
 * concluiu a admissão), nem quando ela está contratada em outra vaga.
 *
 * Devolve o motivo da trava, em texto para a tela, ou `null` quando pode.
 */
export type DadosDoDesfazer = {
  statusDaCandidatura: string;
  pessoa: {
    type: string;
    employmentStatus: string;
    admissionDate: Date | null;
    currentCompanyId: string | null;
  };
  companyIdDaVaga: string;
  /** Algum link de admissão gerado para a pessoa, em qualquer situação. */
  temLinkDeAdmissao: boolean;
  /** Outras candidaturas da mesma pessoa em "Contratado". */
  outrasContratacoes: number;
};

export function travaDoDesfazer(d: DadosDoDesfazer): string | null {
  if (d.statusDaCandidatura !== "CONTRATADO") return "Esta candidatura não está como contratada.";
  if (d.temLinkDeAdmissao) return "A admissão já começou: o DP gerou o link para o colaborador. Para desfazer, fale com o DP.";
  if (d.pessoa.type !== "COLABORADOR" || d.pessoa.employmentStatus !== "ADMISSAO_EM_ANDAMENTO" || d.pessoa.admissionDate) {
    return "A pessoa já está com a admissão concluída ou ativa no DP. Para desfazer, fale com o DP.";
  }
  if (d.pessoa.currentCompanyId !== d.companyIdDaVaga) return "A pessoa está ligada a outra empresa no DP.";
  if (d.outrasContratacoes > 0) return "A pessoa também está contratada em outra vaga.";
  return null;
}
