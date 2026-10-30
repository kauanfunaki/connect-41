-- De-para e lançamentos do Contábil processados no Connect (29/10/2026): os
-- CFOPs da nota no acervo e três tabelas novas da empresa base. Só acrescenta;
-- não altera registros existentes (a coluna nova nasce nula).
-- AlterTable
ALTER TABLE `fiscal_documents` ADD COLUMN `cfops` VARCHAR(200) NULL;

-- CreateTable
CREATE TABLE `contabil_regras` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `cnpjFornecedor` VARCHAR(14) NOT NULL,
    `cfop` VARCHAR(4) NOT NULL,
    `nomeFornecedor` VARCHAR(180) NOT NULL DEFAULT '',
    `contaDebito` VARCHAR(20) NOT NULL DEFAULT '',
    `contaCredito` VARCHAR(20) NOT NULL DEFAULT '',
    `codigoHistorico` VARCHAR(10) NOT NULL DEFAULT '',
    `historico` VARCHAR(255) NOT NULL DEFAULT '',
    `desconsiderar` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contabil_regras_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `contabil_regras_companyId_cnpjFornecedor_cfop_key`(`companyId`, `cnpjFornecedor`, `cfop`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contabil_contas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `reduzido` VARCHAR(20) NOT NULL,
    `classificacao` VARCHAR(40) NOT NULL,
    `nome` VARCHAR(200) NOT NULL,
    `analitica` BOOLEAN NOT NULL DEFAULT true,

    INDEX `contabil_contas_tenantId_companyId_classificacao_idx`(`tenantId`, `companyId`, `classificacao`),
    UNIQUE INDEX `contabil_contas_companyId_reduzido_key`(`companyId`, `reduzido`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contabil_modelos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `debitoCte` VARCHAR(20) NOT NULL DEFAULT '',
    `debitoNfse` VARCHAR(20) NOT NULL DEFAULT '',
    `contaImobilizado` VARCHAR(20) NOT NULL DEFAULT '',
    `historicoImobilizado` VARCHAR(10) NOT NULL DEFAULT '',
    `prefixoFornecedores` VARCHAR(40) NOT NULL DEFAULT '',
    `codigoFilial` VARCHAR(10) NOT NULL DEFAULT '',
    `planoCarregadoEm` DATETIME(3) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `contabil_modelos_companyId_key`(`companyId`),
    INDEX `contabil_modelos_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contabil_regras` ADD CONSTRAINT `contabil_regras_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contabil_contas` ADD CONSTRAINT `contabil_contas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contabil_modelos` ADD CONSTRAINT `contabil_modelos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
