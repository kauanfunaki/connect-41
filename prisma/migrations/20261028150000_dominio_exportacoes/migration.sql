-- Lote 3 (28/10/2026): o histórico das planilhas da Domínio, para a correção
-- exportar só o que mudou. Tabela nova; não altera registros existentes.

-- CreateTable
CREATE TABLE `dominio_exportacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competencia` VARCHAR(7) NOT NULL,
    `tipo` VARCHAR(10) NOT NULL,
    `formato` VARCHAR(4) NOT NULL,
    `linhas` INTEGER NOT NULL,
    `estado` JSON NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dominio_exportacoes_tenantId_companyId_competencia_createdAt_idx`(`tenantId`, `companyId`, `competencia`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dominio_exportacoes` ADD CONSTRAINT `dominio_exportacoes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

