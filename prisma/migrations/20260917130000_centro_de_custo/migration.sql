-- Centro de custo: cadastro por empresa, um centro por lançamento (sem rateio)
-- e o centro padrão da contraparte.
-- Aditiva: tabela nova e duas colunas anuláveis. Nenhum dado existente muda —
-- todo lançamento de antes fica "sem centro de custo", que é como a DRE por
-- centro o mostra. Centro nunca é apagado (inativa-se), então o SET NULL das
-- chaves estrangeiras só existe para não travar uma limpeza manual.

-- AlterTable
ALTER TABLE `finance_counterparties` ADD COLUMN `defaultCostCenterId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `costCenterId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `cost_centers` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(30) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cost_centers_tenantId_companyId_active_idx`(`tenantId`, `companyId`, `active`),
    UNIQUE INDEX `cost_centers_companyId_name_key`(`companyId`, `name`),
    UNIQUE INDEX `cost_centers_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `finance_entries_tenantId_companyId_costCenterId_idx` ON `finance_entries`(`tenantId`, `companyId`, `costCenterId`);

-- AddForeignKey
ALTER TABLE `finance_counterparties` ADD CONSTRAINT `finance_counterparties_defaultCostCenterId_fkey` FOREIGN KEY (`defaultCostCenterId`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entries` ADD CONSTRAINT `finance_entries_costCenterId_fkey` FOREIGN KEY (`costCenterId`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_centers` ADD CONSTRAINT `cost_centers_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cost_centers` ADD CONSTRAINT `cost_centers_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
