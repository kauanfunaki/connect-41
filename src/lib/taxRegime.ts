// Resumo do regime tributário para caber numa coluna de tabela.
//
// Os rótulos vêm do Acessórias e são longos de propósito — "Simples Nacional -
// Comércio ou Serviço - Com Pró-labore - Com Funcionários" tem 73 caracteres.
// Na ficha da empresa isso é informação; numa listagem de 396 linhas, quebra em
// seis linhas e estica a linha inteira, empurrando as ações para fora da tela.

/**
 * Sufixos que NÃO podem sumir no resumo.
 *
 * "Sem movimento" e "Inativa" mudam o trabalho do escritório: empresa sem
 * movimento não gera apuração. Cortar no primeiro hífen deixaria "Lucro
 * Presumido" e "Lucro Presumido - Sem Movimento" idênticos na tela, que é
 * justamente a distinção que o fiscal precisa enxergar de relance.
 *
 * O resto do sufixo — com/sem pró-labore, com/sem funcionários, comércio ou
 * serviço — é detalhe de cadastro e vive na ficha.
 */
const SUFIXOS_QUE_IMPORTAM: { procura: string; mostra: string }[] = [
  { procura: "sem movimento", mostra: "sem movimento" },
  { procura: "inativa", mostra: "inativa" },
];

/**
 * Devolve o regime encurtado para a listagem: o nome do regime, mais o sufixo
 * que muda o trabalho quando existe.
 *
 *   "Simples Nacional - Comércio ou Serviço - Com Pró-labore - Com Funcionários"
 *     → "Simples Nacional"
 *   "Lucro Presumido - Sem Movimento"
 *     → "Lucro Presumido · sem movimento"
 *
 * O texto completo continua disponível — a tabela o passa no `title` da célula,
 * então quem precisar do detalhe descobre parando o mouse em cima.
 */
export function resumirRegime(regime: string | null | undefined): string | null {
  const bruto = (regime ?? "").trim();
  if (!bruto) return null;

  // "Lucro Real Inativa - Sem Funcionários..." já traz o que importa antes do
  // hífen, então a base é sempre o primeiro trecho.
  const base = bruto.split(" - ")[0].trim();
  const baixo = bruto.toLowerCase();

  const sufixo = SUFIXOS_QUE_IMPORTAM.find(
    (s) => baixo.includes(s.procura) && !base.toLowerCase().includes(s.procura)
  );

  return sufixo ? `${base} · ${sufixo.mostra}` : base;
}
