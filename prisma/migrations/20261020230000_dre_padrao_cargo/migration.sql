-- O DRE padrão passa a ser a estrutura da CARGO, com o cálculo da Irriga
-- (20/10/2026 — ver o cabeçalho de src/lib/dre/estrutura.ts). Os doze grupos
-- da Irriga viram os sete novos pelo de-para `GRUPO_DO_ANTIGO`:
--   cmv, mao_de_obra, comerciais         -> custo_operacional
--   pessoal, diretoria, administrativas,
--   financeiras (tarifa do banco e IOF)  -> custo_administrativo
--   investimentos                        -> outras_despesas
-- Só dados: nenhuma coluna muda.

-- 1) O padrão do plano de contas do escritório e das empresas.
UPDATE `finance_categories`
SET `dreGroup` = CASE `dreGroup`
    WHEN 'cmv' THEN 'custo_operacional'
    WHEN 'mao_de_obra' THEN 'custo_operacional'
    WHEN 'comerciais' THEN 'custo_operacional'
    WHEN 'pessoal' THEN 'custo_administrativo'
    WHEN 'diretoria' THEN 'custo_administrativo'
    WHEN 'administrativas' THEN 'custo_administrativo'
    WHEN 'financeiras' THEN 'custo_administrativo'
    WHEN 'investimentos' THEN 'outras_despesas'
  END
WHERE `dreGroup` IN ('cmv', 'mao_de_obra', 'comerciais', 'pessoal', 'diretoria', 'administrativas', 'financeiras', 'investimentos');

-- 2) As sete categorias do plano padrão do escritório que seguem o bloco de
--    financiamentos da CARGO — só onde ainda estão no grupo que o plano dava
--    (quem mudou à mão continua com a escolha dela).
UPDATE `finance_categories`
SET `dreGroup` = 'financiamentos'
WHERE `companyId` IS NULL
  AND `kind` = 'PAGAR'
  AND (
    (`name` = 'Impostos Parcelados' AND `dreGroup` = 'impostos')
    OR (`name` IN (
      'Empréstimos bancários à pagar',
      'Juros sobre empréstimos',
      'Juros e Encargos limite de crédito / cartão',
      'Juros sobre desconto de títulos',
      'Consórcios de automóveis',
      'Consórcios de imóveis'
    ) AND `dreGroup` = 'outras_despesas')
  );

-- 3) As exceções de grupo por empresa.
UPDATE `dre_category_mappings`
SET `grupo` = CASE `grupo`
    WHEN 'cmv' THEN 'custo_operacional'
    WHEN 'mao_de_obra' THEN 'custo_operacional'
    WHEN 'comerciais' THEN 'custo_operacional'
    WHEN 'pessoal' THEN 'custo_administrativo'
    WHEN 'diretoria' THEN 'custo_administrativo'
    WHEN 'administrativas' THEN 'custo_administrativo'
    WHEN 'financeiras' THEN 'custo_administrativo'
    WHEN 'investimentos' THEN 'outras_despesas'
  END
WHERE `grupo` IN ('cmv', 'mao_de_obra', 'comerciais', 'pessoal', 'diretoria', 'administrativas', 'financeiras', 'investimentos');

-- 4) O orçamento: os grupos que se juntam somam, mês a mês.
CREATE TEMPORARY TABLE `_orcamento_migrado` AS
SELECT
  `budgetId`,
  CASE `groupCode`
    WHEN 'cmv' THEN 'custo_operacional'
    WHEN 'mao_de_obra' THEN 'custo_operacional'
    WHEN 'comerciais' THEN 'custo_operacional'
    WHEN 'pessoal' THEN 'custo_administrativo'
    WHEN 'diretoria' THEN 'custo_administrativo'
    WHEN 'administrativas' THEN 'custo_administrativo'
    WHEN 'financeiras' THEN 'custo_administrativo'
    WHEN 'investimentos' THEN 'outras_despesas'
  END AS `groupCode`,
  `month`,
  SUM(`amount`) AS `amount`
FROM `budget_lines`
WHERE `groupCode` IN ('cmv', 'mao_de_obra', 'comerciais', 'pessoal', 'diretoria', 'administrativas', 'financeiras', 'investimentos')
GROUP BY `budgetId`, 2, `month`;

DELETE FROM `budget_lines`
WHERE `groupCode` IN ('cmv', 'mao_de_obra', 'comerciais', 'pessoal', 'diretoria', 'administrativas', 'financeiras', 'investimentos');

-- "outras_despesas" já existia: o investimento soma no valor dela.
INSERT INTO `budget_lines` (`id`, `budgetId`, `groupCode`, `month`, `amount`)
SELECT UUID(), `budgetId`, `groupCode`, `month`, `amount` FROM `_orcamento_migrado`
ON DUPLICATE KEY UPDATE `amount` = `budget_lines`.`amount` + VALUES(`amount`);

DROP TEMPORARY TABLE `_orcamento_migrado`;
