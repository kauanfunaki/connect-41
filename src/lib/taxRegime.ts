import type { TaxRegimeKind } from "@/generated/prisma/enums";

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

/**
 * As opções do campo "Regime tributário" da empresa: os rótulos do Acessórias,
 * de onde veio a carteira. Mora aqui, e não no formulário, para que o teste de
 * `camposDoRegime` confira que cada opção sai com os campos certos.
 */
export const OPCOES_DE_REGIME: readonly string[] = [
  "Indefinido",
  "Domésticas - CEI",
  "Imune/Isenta",
  "Lucro Presumido - Comércio Indústria e Serviço",
  "Lucro Presumido - Sem Movimento",
  "Lucro Real - Comércio Indústria e Serviço",
  "Lucro Real - Sem Movimento",
  "Lucro Real Inativa - Sem Funcionários e Com Pro-Labóre",
  "MEI - Com Funcionário",
  "MEI - Sem Funcionário",
  "Produtor Rural",
  "Simples Nacional - Comércio ou Serviço - Com Pró-labore - Com Funcionários",
  "Simples Nacional - Comércio ou Serviço - Com Pró-labore - Sem Funcionários",
  "Simples Nacional - Comércio ou Serviço - Sem Pró-labore - Com Funcionários",
  "Simples Nacional - Comércio ou Serviço - Sem Pró-labore - Sem Funcionários",
  "Simples Nacional - Serviço ou Comércio - Sem Movimento",
];

// ─── O regime em campos ───────────────────────────────────────────────────────
//
// O texto do Acessórias junta quatro informações num rótulo só: o regime, se
// está sem movimento, se tem funcionários e se tem pró-labore. Quem precisa
// perguntar ao banco — qual guia buscar no Serpro para cada cliente, obrigação
// por regime — não pode casar texto em cada consulta, então a gravação separa
// os quatro em colunas (`Company.taxRegimeKind`, `taxNoMovement`,
// `taxHasEmployees`, `taxHasProLabore`).
//
// O texto continua sendo o que a tela mostra e edita. As colunas são sempre
// derivadas dele, aqui, e nunca escritas à mão: toda gravação de `taxRegime`
// espalha `camposDoRegime(texto)` no `data`, que devolve os cinco juntos.
//
// A migration 20261009100000_regime_estruturado preenche as empresas que já
// existiam com as MESMAS regras, em SQL. Mudou uma regra aqui, muda lá também —
// o teste "bate com o rótulo do Acessórias" segura o lado de cá.

/** Nome curto do regime, para coluna e filtro. */
export const ROTULO_DO_TIPO_DE_REGIME: Record<TaxRegimeKind, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  MEI: "MEI",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
  IMUNE_ISENTA: "Imune ou isenta",
  PRODUTOR_RURAL: "Produtor rural",
  DOMESTICA: "Doméstica",
};

export type CamposDoRegime = {
  taxRegime: string | null;
  taxRegimeKind: TaxRegimeKind | null;
  taxNoMovement: boolean;
  taxHasEmployees: boolean | null;
  taxHasProLabore: boolean | null;
};

/** Minúsculas, sem acento, "_" vira espaço — "SIMPLES_NACIONAL" e "Pró-Labóre" entram iguais aos outros. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Qual regime, olhando só o trecho antes do primeiro " - " ("Lucro Real
 * Inativa", "MEI", "Domésticas"). A ordem é a do CASE da migration.
 */
function tipoDoRegime(base: string): TaxRegimeKind | null {
  if (base === "mei" || base.startsWith("mei ")) return "MEI";
  if (base.includes("simples")) return "SIMPLES_NACIONAL";
  if (base.includes("presumido")) return "LUCRO_PRESUMIDO";
  if (base.includes("lucro real")) return "LUCRO_REAL";
  if (base.includes("imune") || base.includes("isenta")) return "IMUNE_ISENTA";
  if (base.includes("produtor rural")) return "PRODUTOR_RURAL";
  if (base.includes("domestica")) return "DOMESTICA";
  return null; // "Indefinido" e o que não se reconhece
}

/** `true` quando o rótulo diz "com", `false` quando diz "sem", `null` quando não fala do assunto. */
function comOuSem(texto: string, com: RegExp, sem: RegExp): boolean | null {
  if (com.test(texto)) return true;
  if (sem.test(texto)) return false;
  return null;
}

/**
 * O texto do regime e os quatro campos que saem dele, prontos para espalhar no
 * `data` de um `create`/`update` de `Company`:
 *
 *   "Simples Nacional - Comércio ou Serviço - Com Pró-labore - Sem Funcionários"
 *     → SIMPLES_NACIONAL, com movimento, sem funcionários, com pró-labore
 *   "Lucro Presumido - Sem Movimento"
 *     → LUCRO_PRESUMIDO, sem movimento, funcionários e pró-labore não informados
 */
export function camposDoRegime(texto: string | null | undefined): CamposDoRegime {
  const bruto = (texto ?? "").trim();
  if (!bruto) {
    return { taxRegime: null, taxRegimeKind: null, taxNoMovement: false, taxHasEmployees: null, taxHasProLabore: null };
  }
  const tudo = normalizar(bruto);
  return {
    taxRegime: bruto,
    taxRegimeKind: tipoDoRegime(normalizar(bruto.split(" - ")[0])),
    taxNoMovement: tudo.includes("sem movimento") || tudo.includes("inativ"),
    taxHasEmployees: comOuSem(tudo, /com funcionario/, /sem funcionario/),
    taxHasProLabore: comOuSem(tudo, /com pro.*labore/, /sem pro.*labore/),
  };
}
