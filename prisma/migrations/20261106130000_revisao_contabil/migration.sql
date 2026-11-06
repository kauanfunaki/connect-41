-- Revisão do fechamento contábil (AudTool, Fase 2, 05/11/2026): quatro tabelas
-- novas (fechamentos, documentos lidos, execuções da análise e o acompanhamento
-- dos achados). Nada existente é alterado. O módulo nasce desligado
-- (`contabil_revisao`), então a ordem com o deploy não importa, mas rodar
-- ANTES é o de sempre.
-- CreateTable
CREATE TABLE `revisao_fechamentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `inicio` DATE NOT NULL,
    `fim` DATE NOT NULL,
    `regime` VARCHAR(40) NOT NULL,
    `enquadramento` VARCHAR(60) NOT NULL,
    `finalidade` VARCHAR(120) NOT NULL,
    `tolerancia` INTEGER NOT NULL DEFAULT 1,
    `correcoes` JSON NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `revisao_fechamentos_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `revisao_fechamentos_tenantId_fim_idx`(`tenantId`, `fim`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `revisao_documentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `fechamentoId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `tamanho` INTEGER NOT NULL,
    `arquivo` VARCHAR(120) NOT NULL,
    `tipo` VARCHAR(60) NOT NULL,
    `interpretado` BOOLEAN NOT NULL,
    `fatos` JSON NOT NULL,
    `extraidoEm` DATETIME(3) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `enviadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `revisao_documentos_tenantId_fechamentoId_idx`(`tenantId`, `fechamentoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `revisao_execucoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `fechamentoId` VARCHAR(191) NOT NULL,
    `versao` VARCHAR(12) NOT NULL,
    `assinaturaContexto` CHAR(64) NOT NULL,
    `assinaturaEntradas` CHAR(64) NOT NULL,
    `resultado` JSON NOT NULL,
    `achados` INTEGER NOT NULL,
    `executadaPorId` VARCHAR(191) NULL,
    `executadaEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `revisao_execucoes_tenantId_fechamentoId_executadaEm_idx`(`tenantId`, `fechamentoId`, `executadaEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `revisao_acompanhamentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `execucaoId` VARCHAR(191) NOT NULL,
    `achadoId` VARCHAR(20) NOT NULL,
    `responsavel` VARCHAR(120) NULL,
    `estado` VARCHAR(40) NOT NULL,
    `nota` TEXT NULL,
    `atualizadoPorId` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `revisao_acompanhamentos_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `revisao_acompanhamentos_execucaoId_achadoId_key`(`execucaoId`, `achadoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `revisao_fechamentos` ADD CONSTRAINT `revisao_fechamentos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revisao_fechamentos` ADD CONSTRAINT `revisao_fechamentos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revisao_documentos` ADD CONSTRAINT `revisao_documentos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revisao_documentos` ADD CONSTRAINT `revisao_documentos_fechamentoId_fkey` FOREIGN KEY (`fechamentoId`) REFERENCES `revisao_fechamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revisao_execucoes` ADD CONSTRAINT `revisao_execucoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revisao_execucoes` ADD CONSTRAINT `revisao_execucoes_fechamentoId_fkey` FOREIGN KEY (`fechamentoId`) REFERENCES `revisao_fechamentos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revisao_acompanhamentos` ADD CONSTRAINT `revisao_acompanhamentos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `revisao_acompanhamentos` ADD CONSTRAINT `revisao_acompanhamentos_execucaoId_fkey` FOREIGN KEY (`execucaoId`) REFERENCES `revisao_execucoes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

