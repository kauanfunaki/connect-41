-- DP 2 · eSocial: totalizadores S-5001, S-5002, S-5003, S-5011 e S-5013 (26/11/2026, funcionalidade-755). Só cria a tabela.
CREATE TABLE `dp2_totalizadores_esocial` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NULL,
    `personId` VARCHAR(191) NULL,
    `tipo` VARCHAR(6) NOT NULL,
    `perApur` VARCHAR(7) NOT NULL,
    `cpf` VARCHAR(11) NULL,
    `reciboBase` VARCHAR(40) NULL,
    `eventoId` VARCHAR(36) NULL,
    `valores` JSON NOT NULL,
    `arquivo` VARCHAR(255) NULL,
    `importadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_totalizadores_esocial_tenantId_companyId_perApur_idx`(`tenantId`, `companyId`, `perApur`),
    INDEX `dp2_totalizadores_esocial_competenciaId_idx`(`competenciaId`),
    INDEX `dp2_totalizadores_esocial_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_totalizadores_esocial` ADD CONSTRAINT `dp2_totalizadores_esocial_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `dp2_totalizadores_esocial` ADD CONSTRAINT `dp2_totalizadores_esocial_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
