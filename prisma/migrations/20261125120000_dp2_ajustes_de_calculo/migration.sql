-- DP 2: ajuste manual do cálculo e das provisões (25/11/2026, funcionalidade-768). Só cria a tabela.
CREATE TABLE `dp2_ajustes_de_calculo` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `campo` VARCHAR(40) NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `valorCalculado` DECIMAL(12, 2) NULL,
    `motivo` VARCHAR(500) NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dp2_ajustes_de_calculo_tenantId_competenciaId_idx`(`tenantId`, `competenciaId`),
    INDEX `dp2_ajustes_de_calculo_personId_idx`(`personId`),
    UNIQUE INDEX `dp2_ajustes_de_calculo_competenciaId_personId_campo_key`(`competenciaId`, `personId`, `campo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_ajustes_de_calculo` ADD CONSTRAINT `dp2_ajustes_de_calculo_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `dp2_ajustes_de_calculo` ADD CONSTRAINT `dp2_ajustes_de_calculo_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

