-- A baixa do Omie uma a uma (fila do BPO, 19/10): o código da baixa lá
-- (`nCodBaixa`), para a leitura seguinte achar a mesma e não duplicar.
-- Só aditiva: as baixas que já existem ficam sem código.
ALTER TABLE `finance_entry_payments` ADD COLUMN `omieBaixaId` VARCHAR(20) NULL;
