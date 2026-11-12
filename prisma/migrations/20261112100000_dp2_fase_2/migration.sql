-- DP 2, fase 2 (12/11/2026, funcionalidade-633): contas bancárias para a
-- remessa CNAB 240, as remessas geradas, o link para o cliente informar os
-- eventos do mês e as contas contábeis da folha. Só colunas novas (opcionais
-- ou com padrão) e tabelas novas; nenhum registro existente muda.

-- AlterTable
ALTER TABLE `dp2_empresas_config` ADD COLUMN `agencia` VARCHAR(10) NULL,
    ADD COLUMN `agenciaDigito` VARCHAR(2) NULL,
    ADD COLUMN `bancoCodigo` VARCHAR(3) NULL,
    ADD COLUMN `conta` VARCHAR(20) NULL,
    ADD COLUMN `contaDigito` VARCHAR(2) NULL,
    ADD COLUMN `convenio` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `dp2_vinculos` ADD COLUMN `agencia` VARCHAR(10) NULL,
    ADD COLUMN `agenciaDigito` VARCHAR(2) NULL,
    ADD COLUMN `bancoCodigo` VARCHAR(3) NULL,
    ADD COLUMN `conta` VARCHAR(20) NULL,
    ADD COLUMN `contaDigito` VARCHAR(2) NULL,
    ADD COLUMN `tipoConta` VARCHAR(10) NOT NULL DEFAULT 'CORRENTE';

-- CreateTable
CREATE TABLE `dp2_remessas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `bancoCodigo` VARCHAR(3) NOT NULL,
    `sequencial` INTEGER NOT NULL,
    `dataPagamento` VARCHAR(10) NOT NULL,
    `quantidade` INTEGER NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,
    `nomeArquivo` VARCHAR(120) NOT NULL,
    `conteudo` LONGTEXT NOT NULL,
    `foraDaRemessa` JSON NOT NULL,
    `geradaPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_remessas_tenantId_competenciaId_idx`(`tenantId`, `competenciaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_pedidos_de_eventos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `situacao` VARCHAR(10) NOT NULL DEFAULT 'ABERTO',
    `expiraEm` DATETIME(3) NOT NULL,
    `respondidoEm` DATETIME(3) NULL,
    `semEventos` BOOLEAN NOT NULL DEFAULT false,
    `observacao` TEXT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `dp2_pedidos_de_eventos_token_key`(`token`),
    INDEX `dp2_pedidos_de_eventos_tenantId_competenciaId_idx`(`tenantId`, `competenciaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_contas_da_folha` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `contas` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dp2_contas_da_folha_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dp2_remessas` ADD CONSTRAINT `dp2_remessas_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_pedidos_de_eventos` ADD CONSTRAINT `dp2_pedidos_de_eventos_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

