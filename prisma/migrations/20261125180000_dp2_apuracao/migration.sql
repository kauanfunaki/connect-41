-- DP 2: informações da apuração e PIS sobre a folha (25/11/2026, funcionalidade-769, parte 2).
-- Cria a tabela dp2_informacoes_da_apuracao e a coluna pisSobreFolha (padrão false) em dp2_empresas_config.
ALTER TABLE `dp2_empresas_config` ADD COLUMN `pisSobreFolha` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `dp2_informacoes_da_apuracao` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `documento` VARCHAR(14) NULL,
    `referencia` VARCHAR(30) NULL,
    `observacao` VARCHAR(300) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_informacoes_da_apuracao_tenantId_competenciaId_idx`(`tenantId`, `competenciaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_informacoes_da_apuracao` ADD CONSTRAINT `dp2_informacoes_da_apuracao_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
