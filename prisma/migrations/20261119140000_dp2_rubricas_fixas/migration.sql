-- DP 2: rubricas fixas do contrato (19/11/2026, funcionalidade-767).
CREATE TABLE `dp2_rubricas_fixas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `rubricaId` VARCHAR(191) NOT NULL,
    `quantidade` DECIMAL(10, 2) NULL,
    `valor` DECIMAL(12, 2) NULL,
    `inicio` VARCHAR(7) NOT NULL,
    `fim` VARCHAR(7) NULL,
    `observacao` VARCHAR(300) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dp2_rubricas_fixas_tenantId_personId_idx`(`tenantId`, `personId`),
    INDEX `dp2_rubricas_fixas_rubricaId_idx`(`rubricaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_rubricas_fixas` ADD CONSTRAINT `dp2_rubricas_fixas_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dp2_rubricas_fixas` ADD CONSTRAINT `dp2_rubricas_fixas_rubricaId_fkey` FOREIGN KEY (`rubricaId`) REFERENCES `dp2_rubricas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
