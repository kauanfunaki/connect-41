-- Triagem de currículos (R1): requisitos versionados por vaga, nota de
-- compatibilidade por candidatura (com histórico) e o perfil profissional
-- extraído do currículo guardado na candidatura.
--
-- Aditiva: cria duas tabelas e acrescenta duas colunas opcionais em
-- `candidaturas`. Pode rodar antes do deploy.

-- AlterTable
ALTER TABLE `candidaturas` ADD COLUMN `perfilProfissional` JSON NULL,
    ADD COLUMN `perfilProfissionalEm` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `vaga_requisitos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `vagaId` VARCHAR(191) NOT NULL,
    `versao` INTEGER NOT NULL,
    `itens` JSON NOT NULL,
    `corteCompativel` INTEGER NOT NULL,
    `corteParcial` INTEGER NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vaga_requisitos_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `vaga_requisitos_vagaId_versao_key`(`vagaId`, `versao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `candidatura_notas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `candidaturaId` VARCHAR(191) NOT NULL,
    `requisitosId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `faixa` VARCHAR(20) NOT NULL,
    `avaliacoes` JSON NOT NULL,
    `resumo` TEXT NULL,
    `origem` VARCHAR(20) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `candidatura_notas_candidaturaId_createdAt_idx`(`candidaturaId`, `createdAt`),
    INDEX `candidatura_notas_requisitosId_idx`(`requisitosId`),
    INDEX `candidatura_notas_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `vaga_requisitos` ADD CONSTRAINT `vaga_requisitos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vaga_requisitos` ADD CONSTRAINT `vaga_requisitos_vagaId_fkey` FOREIGN KEY (`vagaId`) REFERENCES `vagas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidatura_notas` ADD CONSTRAINT `candidatura_notas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidatura_notas` ADD CONSTRAINT `candidatura_notas_candidaturaId_fkey` FOREIGN KEY (`candidaturaId`) REFERENCES `candidaturas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidatura_notas` ADD CONSTRAINT `candidatura_notas_requisitosId_fkey` FOREIGN KEY (`requisitosId`) REFERENCES `vaga_requisitos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

