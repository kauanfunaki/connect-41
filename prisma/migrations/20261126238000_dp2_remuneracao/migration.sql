-- Remuneração no DP 2: diferenças retroativas e níveis salariais (funcionalidade-760)
CREATE TABLE `dp2_diferencas_retroativas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `loteId` VARCHAR(36) NOT NULL,
    `origem` VARCHAR(20) NOT NULL,
    `perRef` VARCHAR(7) NOT NULL,
    `instrumento` VARCHAR(1) NULL,
    `dataInstrumento` DATE NULL,
    `descricao` VARCHAR(255) NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `inss` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `memoria` TEXT NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_diferencas_retroativas_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_diferencas_retroativas_competenciaId_personId_idx`(`competenciaId`, `personId`),
    INDEX `dp2_diferencas_retroativas_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dp2_niveis_salariais` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(80) NOT NULL,
    `faixas` JSON NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_niveis_salariais_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_vinculos` ADD COLUMN `nivelId` VARCHAR(191) NULL;

ALTER TABLE `dp2_diferencas_retroativas` ADD CONSTRAINT `dp2_diferencas_retroativas_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dp2_diferencas_retroativas` ADD CONSTRAINT `dp2_diferencas_retroativas_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
