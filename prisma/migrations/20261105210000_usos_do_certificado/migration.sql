-- Onde cada certificado digital é usado e a renovação dele (05/11/2026, tela
-- Certificados, opção A). Duas tabelas novas (os usos, por documento, e a
-- contagem por dia) e cinco colunas anuláveis em digital_certificates para a
-- renovação. Nada é apagado nem reescrito; rodar ANTES do deploy, porque a
-- tela lê as colunas novas.

-- AlterTable
ALTER TABLE `digital_certificates` ADD COLUMN `renovacaoAtualizadaEm` DATETIME(3) NULL,
    ADD COLUMN `renovacaoCustoCentavos` INTEGER NULL,
    ADD COLUMN `renovacaoPagaQuem` VARCHAR(10) NULL,
    ADD COLUMN `renovacaoResponsavelId` VARCHAR(191) NULL,
    ADD COLUMN `renovacaoStatus` VARCHAR(12) NULL;

-- CreateTable
CREATE TABLE `digital_certificate_uses` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `uso` VARCHAR(40) NOT NULL,
    `descricao` VARCHAR(80) NULL,
    `declarado` BOOLEAN NOT NULL DEFAULT false,
    `declaradoPorId` VARCHAR(191) NULL,
    `ultimoUsoAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `digital_certificate_uses_tenantId_documento_uso_key`(`tenantId`, `documento`, `uso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `digital_certificate_use_days` (
    `tenantId` VARCHAR(191) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `uso` VARCHAR(40) NOT NULL,
    `dia` DATE NOT NULL,
    `vezes` INTEGER NOT NULL DEFAULT 0,

    INDEX `digital_certificate_use_days_tenantId_dia_idx`(`tenantId`, `dia`),
    PRIMARY KEY (`tenantId`, `documento`, `uso`, `dia`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `digital_certificate_uses` ADD CONSTRAINT `digital_certificate_uses_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `digital_certificate_use_days` ADD CONSTRAINT `digital_certificate_use_days_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

