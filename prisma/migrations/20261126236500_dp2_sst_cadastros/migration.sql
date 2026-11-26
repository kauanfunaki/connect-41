-- Cadastros de SST no DP 2: ambientes de trabalho, EPI e entregas (funcionalidade-761)
CREATE TABLE `dp2_ambientes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `atividade` TEXT NULL,
    `agentes` VARCHAR(500) NOT NULL DEFAULT '',
    `usaEpc` VARCHAR(1) NOT NULL DEFAULT '0',
    `usaEpi` VARCHAR(1) NOT NULL DEFAULT '0',
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_ambientes_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dp2_epis` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `ca` VARCHAR(10) NOT NULL,
    `validadeCa` DATE NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_epis_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dp2_entregas_de_epi` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `epiId` VARCHAR(191) NOT NULL,
    `data` DATE NOT NULL,
    `quantidade` INTEGER NOT NULL DEFAULT 1,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_entregas_de_epi_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_entregas_de_epi_personId_idx`(`personId`),
    INDEX `dp2_entregas_de_epi_epiId_idx`(`epiId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_entregas_de_epi` ADD CONSTRAINT `dp2_entregas_de_epi_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dp2_entregas_de_epi` ADD CONSTRAINT `dp2_entregas_de_epi_epiId_fkey` FOREIGN KEY (`epiId`) REFERENCES `dp2_epis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
