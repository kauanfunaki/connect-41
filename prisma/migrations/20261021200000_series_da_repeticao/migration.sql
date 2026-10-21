-- A regra de cada série da repetição (21/10): a série sem data de fim, ou até
-- uma data, nasce até o horizonte e o agendador cria as próximas. Tabela nova;
-- nada existente muda — as séries de antes continuam com número de vezes.
-- CreateTable
CREATE TABLE `finance_recurrences` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `frequency` VARCHAR(12) NOT NULL,
    `dayAdjust` VARCHAR(10) NOT NULL,
    `endMode` VARCHAR(8) NOT NULL,
    `endDate` VARCHAR(10) NULL,
    `total` INTEGER NULL,
    `firstDueDate` VARCHAR(10) NOT NULL,
    `firstCompetence` VARCHAR(7) NOT NULL,
    `lastIndex` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `finance_recurrences_active_endMode_idx`(`active`, `endMode`),
    INDEX `finance_recurrences_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `finance_recurrences` ADD CONSTRAINT `finance_recurrences_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
