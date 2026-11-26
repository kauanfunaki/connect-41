-- Alocação em tomador: cessão de mão de obra e trabalho temporário no DP 2 (funcionalidade-772)
CREATE TABLE `dp2_alocacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `tomadorCnpj` VARCHAR(14) NOT NULL,
    `tomadorNome` VARCHAR(160) NOT NULL,
    `inicio` DATE NOT NULL,
    `fim` DATE NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_alocacoes_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_alocacoes_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_alocacoes` ADD CONSTRAINT `dp2_alocacoes_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
