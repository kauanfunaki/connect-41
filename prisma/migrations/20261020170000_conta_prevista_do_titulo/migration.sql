-- Conta corrente prevista do título (lote D, 20/10): por onde a conta deve
-- ser paga ou recebida. Opcional; some com a conta bancária (SET NULL).
-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `bankAccountId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `finance_entries_bankAccountId_idx` ON `finance_entries`(`bankAccountId`);

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

