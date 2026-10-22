-- Juros e multa pelo atraso (22/10/2026): a regra da empresa e, por cima
-- dela, a do fornecedor ou cliente. Tudo nulo é sem regra — nada muda na
-- janela da baixa. Ver src/lib/financeiro/baixa/encargos.ts.
ALTER TABLE `companies`
    ADD COLUMN `lateFinePercent` DECIMAL(7, 4) NULL,
    ADD COLUMN `lateInterestPercent` DECIMAL(7, 4) NULL,
    ADD COLUMN `earlyDiscountPercent` DECIMAL(7, 4) NULL;

ALTER TABLE `finance_counterparties`
    ADD COLUMN `lateFinePercent` DECIMAL(7, 4) NULL,
    ADD COLUMN `lateInterestPercent` DECIMAL(7, 4) NULL,
    ADD COLUMN `earlyDiscountPercent` DECIMAL(7, 4) NULL;
