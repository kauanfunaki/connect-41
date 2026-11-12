-- Contábil Core, Bloco B (Fase B4, 12/11/2026): a conferência do financeiro.
-- Três tabelas novas, porte de financeiro_analises, financeiro_documentos e
-- financeiro_vinculos do original (0041 e 0044): a análise (com o snapshot das
-- linhas dos documentos e do extrato), os originais enviados e as decisões da
-- pessoa, com versão otimista na análise. Só CREATE TABLE, chaves e checagens:
-- nada existente é alterado.
--
-- - `agenciaId` é referência documental, SEM chave estrangeira, como no original:
--   a análise nunca trava a exclusão da conta bancária.
-- - Os bytes dos originais NÃO ficam no banco (o original guardava em `conteudo`):
--   vão para storage/contabil-core/financeiro/<storageKey>, e a linha guarda nome,
--   tipo, SHA-256, tipo de mídia, tamanho e a chave.
-- - A unicidade (análise, hash do arquivo) do original é total (não parcial):
--   continua como índice único comum.
-- - As checagens do original entram como CHECK, que o MySQL 8 confere.
-- Desenho em docs/CONTABIL-CORE.md (Fase B4).

-- CreateTable
CREATE TABLE `core_financeiro_analises` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `agenciaId` VARCHAR(191) NOT NULL,
    `criadoPorId` VARCHAR(191) NOT NULL,
    `titulo` VARCHAR(200) NOT NULL,
    `contaBancaria` VARCHAR(255) NOT NULL,
    `periodoInicio` DATE NOT NULL,
    `periodoFim` DATE NOT NULL,
    `extratoHash` CHAR(64) NOT NULL,
    `versao` INTEGER NOT NULL DEFAULT 1,
    `snapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_financeiro_analises_empresaId_agenciaId_idx`(`empresaId`, `agenciaId`),
    INDEX `core_financeiro_analises_empresaId_updatedAt_idx`(`empresaId`, `updatedAt`),
    INDEX `core_financeiro_analises_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_financeiro_documentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `analiseId` VARCHAR(191) NOT NULL,
    `nomeArquivo` VARCHAR(255) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `hashArquivo` CHAR(64) NOT NULL,
    `mediaType` VARCHAR(100) NOT NULL,
    `tamanho` INTEGER NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_financeiro_documentos_empresaId_idx`(`empresaId`),
    INDEX `core_financeiro_documentos_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_financeiro_documentos_analiseId_hashArquivo_key`(`analiseId`, `hashArquivo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_financeiro_vinculos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `analiseId` VARCHAR(191) NOT NULL,
    `tipoComparacao` VARCHAR(20) NOT NULL,
    `financeiroIds` JSON NOT NULL,
    `comparacaoIds` JSON NOT NULL,
    `totalFinanceiro` DECIMAL(15, 2) NOT NULL,
    `totalComparacao` DECIMAL(15, 2) NOT NULL,
    `diferenca` DECIMAL(15, 2) NOT NULL,
    `observacao` TEXT NOT NULL,
    `estado` VARCHAR(10) NOT NULL DEFAULT 'ATIVO',
    `confirmadoPorId` VARCHAR(191) NOT NULL,
    `responsavel` VARCHAR(200) NOT NULL,
    `desfeitoPor` VARCHAR(200) NULL,
    `desfeitoEm` DATETIME(3) NULL,
    `motivoDesfazer` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_financeiro_vinculos_analiseId_estado_idx`(`analiseId`, `estado`),
    INDEX `core_financeiro_vinculos_empresaId_idx`(`empresaId`),
    INDEX `core_financeiro_vinculos_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- AddForeignKey
ALTER TABLE `core_financeiro_analises` ADD CONSTRAINT `core_financeiro_analises_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_financeiro_documentos` ADD CONSTRAINT `core_financeiro_documentos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_financeiro_documentos` ADD CONSTRAINT `core_financeiro_documentos_analiseId_fkey` FOREIGN KEY (`analiseId`) REFERENCES `core_financeiro_analises`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_financeiro_vinculos` ADD CONSTRAINT `core_financeiro_vinculos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_financeiro_vinculos` ADD CONSTRAINT `core_financeiro_vinculos_analiseId_fkey` FOREIGN KEY (`analiseId`) REFERENCES `core_financeiro_analises`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checagens do original (ck_financeiro_analise_versao, ck_financeiro_analise_periodo,
-- ck_financeiro_documento_tipo, ck_financeiro_documento_tamanho, ck_financeiro_vinculo_tipo,
-- ck_financeiro_vinculo_estado, ck_financeiro_vinculo_totais), com os tipos da 0044.
ALTER TABLE `core_financeiro_analises` ADD CONSTRAINT `ck_core_financeiro_analise_versao` CHECK (`versao` > 0);

ALTER TABLE `core_financeiro_analises` ADD CONSTRAINT `ck_core_financeiro_analise_periodo` CHECK (`periodoFim` >= `periodoInicio`);

ALTER TABLE `core_financeiro_documentos` ADD CONSTRAINT `ck_core_financeiro_documento_tipo` CHECK (`tipo` IN ('FINANCEIRO', 'SISPAG', 'RAZAO', 'EXTRATO_DETALHADO'));

ALTER TABLE `core_financeiro_documentos` ADD CONSTRAINT `ck_core_financeiro_documento_tamanho` CHECK (`tamanho` > 0);

ALTER TABLE `core_financeiro_vinculos` ADD CONSTRAINT `ck_core_financeiro_vinculo_tipo` CHECK (`tipoComparacao` IN ('EXTRATO', 'SISPAG', 'RAZAO', 'RAZAO_SISPAG', 'RAZAO_DETALHADO'));

ALTER TABLE `core_financeiro_vinculos` ADD CONSTRAINT `ck_core_financeiro_vinculo_estado` CHECK (`estado` IN ('ATIVO', 'DESFEITO'));

ALTER TABLE `core_financeiro_vinculos` ADD CONSTRAINT `ck_core_financeiro_vinculo_totais` CHECK (`totalFinanceiro` > 0 AND `totalComparacao` > 0);
