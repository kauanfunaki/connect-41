-- DP 2, fase 3a (12/11/2026, funcionalidade-634): os eventos do eSocial gerados
-- pelo DP 2 (sem assinatura e envio) e os dados que eles pedem — matrícula e
-- categoria no contrato, códigos de incidência na rubrica, FPAS, terceiros e
-- classificação tributária na empresa. Só colunas novas (opcionais ou com
-- padrão) e uma tabela nova; nenhum registro existente muda.

-- AlterTable
ALTER TABLE `dp2_rubricas` ADD COLUMN `codIncCP` VARCHAR(2) NULL,
    ADD COLUMN `codIncFGTS` VARCHAR(2) NULL,
    ADD COLUMN `codIncIRRF` VARCHAR(2) NULL;

-- AlterTable
ALTER TABLE `dp2_empresas_config` ADD COLUMN `classTrib` VARCHAR(2) NULL,
    ADD COLUMN `codTercs` VARCHAR(4) NULL,
    ADD COLUMN `fpas` VARCHAR(3) NULL;

-- AlterTable
ALTER TABLE `dp2_vinculos` ADD COLUMN `categoria` VARCHAR(3) NOT NULL DEFAULT '101',
    ADD COLUMN `matricula` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `dp2_eventos_esocial` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NULL,
    `personId` VARCHAR(191) NULL,
    `tipo` VARCHAR(6) NOT NULL,
    `referencia` VARCHAR(80) NOT NULL,
    `idEvento` VARCHAR(36) NOT NULL,
    `situacao` VARCHAR(10) NOT NULL,
    `xml` LONGTEXT NOT NULL,
    `pendencias` JSON NOT NULL,
    `recibo` VARCHAR(40) NULL,
    `geradoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dp2_eventos_esocial_idEvento_key`(`idEvento`),
    INDEX `dp2_eventos_esocial_tenantId_companyId_tipo_idx`(`tenantId`, `companyId`, `tipo`),
    INDEX `dp2_eventos_esocial_competenciaId_idx`(`competenciaId`),
    INDEX `dp2_eventos_esocial_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dp2_eventos_esocial` ADD CONSTRAINT `dp2_eventos_esocial_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_eventos_esocial` ADD CONSTRAINT `dp2_eventos_esocial_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_eventos_esocial` ADD CONSTRAINT `dp2_eventos_esocial_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

