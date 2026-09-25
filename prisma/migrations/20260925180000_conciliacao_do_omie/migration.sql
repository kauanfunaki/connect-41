-- Conciliação lida do Omie (Fase 1, 25/09): a baixa do título (conta corrente,
-- código, valor pago, data da conciliação), as transferências entre contas, a
-- ligação da conta bancária do Connect com a do Omie e a marca da linha do extrato
-- conciliada pelo Omie. Só acrescenta colunas e índices; nenhum dado muda.
-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `omieAccountId` VARCHAR(20) NULL,
    ADD COLUMN `omieBaixaId` VARCHAR(20) NULL,
    ADD COLUMN `omieMovementId` VARCHAR(20) NULL,
    ADD COLUMN `omiePaidAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `omieReconciledAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `bank_accounts` ADD COLUMN `omieAccountId` VARCHAR(20) NULL,
    ADD COLUMN `omieAccountLabel` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `bank_transactions` ADD COLUMN `omieAutoSkip` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reconciledViaOmie` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `finance_entries_companyId_omieAccountId_omieReconciledAt_idx` ON `finance_entries`(`companyId`, `omieAccountId`, `omieReconciledAt`);

-- CreateIndex
CREATE UNIQUE INDEX `finance_entries_companyId_omieMovementId_key` ON `finance_entries`(`companyId`, `omieMovementId`);

-- CreateIndex
CREATE UNIQUE INDEX `bank_accounts_companyId_omieAccountId_key` ON `bank_accounts`(`companyId`, `omieAccountId`);

