-- Transferência entre contas da mesma empresa na conciliação (19/10, retorno
-- do BPO): a saída numa conta e a entrada na outra são dois lançamentos com o
-- mesmo `transferId`.
--
-- Aditiva: uma coluna anulável e o índice. Nenhum dado existente muda — as
-- transferências que vêm do Omie continuam identificadas pelo `omieMovementId`.

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `transferId` VARCHAR(36) NULL;

-- CreateIndex
CREATE INDEX `finance_entries_tenantId_transferId_idx` ON `finance_entries`(`tenantId`, `transferId`);
