import type { AlcanceFiscal } from "@/lib/fiscal/alcance";

/**
 * Alcance da equipe do escritório: o tenant inteiro.
 *
 * Fica numa função nomeada, e não escrito à mão em cada página, para o dia em
 * que a regra deixar de ser "o tenant inteiro" — quando o escopo por setor ou
 * por carteira de cliente entrar, muda aqui e não em quatro telas.
 *
 * O alcance do portal do cliente **não** mora aqui: ele é montado a partir das
 * empresas ligadas ao acesso logado (`alcanceDoCliente`; era o `ClientGroup`
 * até 14/10/2026), e é justamente por serem construções diferentes que o tipo
 * existe.
 */
export function alcanceDaEquipe(tenantId: string): AlcanceFiscal {
  return { tipo: "TENANT", tenantId };
}
