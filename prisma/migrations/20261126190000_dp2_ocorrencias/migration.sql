-- Advertências e suspensões do DP 2 (funcionalidade-763)
CREATE TABLE `dp2_ocorrencias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `data` DATE NOT NULL,
    `dias` INTEGER NOT NULL DEFAULT 0,
    `motivo` TEXT NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_ocorrencias_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_ocorrencias_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_ocorrencias` ADD CONSTRAINT `dp2_ocorrencias_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
