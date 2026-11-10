-- Controle interno (10/11/2026): o critério de aceite num campo próprio, fora
-- da descrição, e a conferência do "Aprovado quando", com quem marcou. Coluna
-- nova e opcional e tabela nova; não altera registros existentes. A passagem
-- do bloco "CRITÉRIO DE ACEITE" da descrição para o campo novo é à parte, pelo
-- script scripts/criterio-de-aceite-para-o-campo.ts (simulação por padrão).
-- AlterTable
ALTER TABLE `tech_internal_items` ADD COLUMN `acceptanceCriteria` TEXT NULL;

-- CreateTable
CREATE TABLE `tech_internal_acceptance_checks` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `checkedById` VARCHAR(191) NOT NULL,
    `checkedByName` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tech_internal_acceptance_checks_tenantId_itemId_position_key`(`tenantId`, `itemId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tech_internal_acceptance_checks` ADD CONSTRAINT `tech_internal_acceptance_checks_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_acceptance_checks` ADD CONSTRAINT `tech_internal_acceptance_checks_tenantId_itemId_fkey` FOREIGN KEY (`tenantId`, `itemId`) REFERENCES `tech_internal_items`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
