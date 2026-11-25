-- Saldo inicial das médias do DP 2 (funcionalidade-747)
-- CreateTable
CREATE TABLE `dp2_saldo_inicial_medias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `competencia` VARCHAR(7) NOT NULL,
    `rubricaId` VARCHAR(191) NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `conferidoEm` DATETIME(3) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_saldo_inicial_medias_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `dp2_saldo_inicial_medias_personId_competencia_rubricaId_key`(`personId`, `competencia`, `rubricaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_saldo_inicial_medias` ADD CONSTRAINT `dp2_saldo_inicial_medias_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
