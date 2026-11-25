-- DP 2: outras bases de INSS, mais de um vínculo (25/11/2026, funcionalidade-769). Só cria a tabela.
CREATE TABLE `dp2_outras_bases_inss` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `tpInsc` TINYINT NOT NULL,
    `nrInsc` VARCHAR(14) NOT NULL,
    `codCateg` VARCHAR(3) NOT NULL DEFAULT '101',
    `remuneracao` DECIMAL(12, 2) NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_outras_bases_inss_tenantId_competenciaId_idx`(`tenantId`, `competenciaId`),
    INDEX `dp2_outras_bases_inss_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_outras_bases_inss` ADD CONSTRAINT `dp2_outras_bases_inss_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `dp2_outras_bases_inss` ADD CONSTRAINT `dp2_outras_bases_inss_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

