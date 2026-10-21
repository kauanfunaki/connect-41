-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `cardAccountId` VARCHAR(191) NULL,
    ADD COLUMN `cardCycle` VARCHAR(7) NULL;

-- AlterTable
ALTER TABLE `bank_accounts` ADD COLUMN `cardClosingDay` TINYINT NULL,
    ADD COLUMN `cardDueDay` TINYINT NULL,
    MODIFY `type` ENUM('CORRENTE', 'POUPANCA', 'ADIANTAMENTO_FORNECEDOR', 'ADIANTAMENTO_CLIENTE', 'CARTAO_CREDITO') NOT NULL DEFAULT 'CORRENTE';

-- AlterTable
ALTER TABLE `finance_entry_payments` ADD COLUMN `cardInvoiceId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `finance_entries_cardAccountId_cardCycle_key` ON `finance_entries`(`cardAccountId`, `cardCycle`);

-- CreateIndex
CREATE INDEX `finance_entry_payments_cardInvoiceId_idx` ON `finance_entry_payments`(`cardInvoiceId`);

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_cardAccountId_fkey` FOREIGN KEY (`cardAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_cardInvoiceId_fkey` FOREIGN KEY (`cardInvoiceId`) REFERENCES `finance_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

