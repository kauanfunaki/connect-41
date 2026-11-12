-- Contábil Core, Bloco B (Fase B3, 12/11/2026): a revisão manual da conciliação
-- Razão × extrato. Duas tabelas novas, core_conciliacao_revisoes (a cópia da
-- conferência: relatório e snapshot das fontes) e core_conciliacao_vinculos (as
-- decisões da pessoa, com versão otimista na revisão), porte de
-- conciliacao_revisoes e conciliacao_vinculos do original (0040 e 0042).
-- Só CREATE TABLE, chaves e checagens: nada existente é alterado.
--
-- - `agenciaId` é referência documental, SEM chave estrangeira, como no original:
--   a revisão nunca trava a exclusão da conta bancária.
-- - O índice único parcial `uq_conciliacao_revisao_origem` (… WHERE deleted_at IS
--   NULL) vira a coluna `chaveAtiva`, nula quando a revisão é excluída (chaves.ts).
-- - As checagens do original (`versao > 0`, estado e totais) entram como CHECK,
--   que o MySQL 8 confere.
-- Desenho em docs/CONTABIL-CORE.md.

-- CreateTable
CREATE TABLE `core_conciliacao_revisoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `agenciaId` VARCHAR(191) NOT NULL,
    `criadoPorId` VARCHAR(191) NOT NULL,
    `nomeArquivo` VARCHAR(255) NOT NULL,
    `titulo` VARCHAR(200) NULL,
    `contaBancaria` VARCHAR(255) NOT NULL,
    `periodoInicio` DATE NOT NULL,
    `periodoFim` DATE NOT NULL,
    `revisaoHash` CHAR(64) NOT NULL,
    `extratoHash` CHAR(64) NOT NULL,
    `versao` INTEGER NOT NULL DEFAULT 1,
    `snapshot` JSON NOT NULL,
    `relatorio` JSON NOT NULL,
    `chaveAtiva` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_conciliacao_revisoes_empresaId_agenciaId_idx`(`empresaId`, `agenciaId`),
    INDEX `core_conciliacao_revisoes_empresaId_updatedAt_idx`(`empresaId`, `updatedAt`),
    INDEX `core_conciliacao_revisoes_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_conciliacao_revisoes_empresaId_agenciaId_chaveAtiva_key`(`empresaId`, `agenciaId`, `chaveAtiva`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_conciliacao_vinculos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `revisaoId` VARCHAR(191) NOT NULL,
    `extratoIds` JSON NOT NULL,
    `razaoItens` JSON NOT NULL,
    `totalExtrato` DECIMAL(15, 2) NOT NULL,
    `totalRazao` DECIMAL(15, 2) NOT NULL,
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

    INDEX `core_conciliacao_vinculos_revisaoId_estado_idx`(`revisaoId`, `estado`),
    INDEX `core_conciliacao_vinculos_empresaId_idx`(`empresaId`),
    INDEX `core_conciliacao_vinculos_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `core_conciliacao_revisoes` ADD CONSTRAINT `core_conciliacao_revisoes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_conciliacao_vinculos` ADD CONSTRAINT `core_conciliacao_vinculos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_conciliacao_vinculos` ADD CONSTRAINT `core_conciliacao_vinculos_revisaoId_fkey` FOREIGN KEY (`revisaoId`) REFERENCES `core_conciliacao_revisoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Checagens do original (ck_conciliacao_revisao_versao, ck_conciliacao_vinculo_estado, ck_conciliacao_vinculo_totais)
ALTER TABLE `core_conciliacao_revisoes` ADD CONSTRAINT `ck_core_conciliacao_revisao_versao` CHECK (`versao` > 0);

ALTER TABLE `core_conciliacao_vinculos` ADD CONSTRAINT `ck_core_conciliacao_vinculo_estado` CHECK (`estado` IN ('ATIVO', 'DESFEITO'));

ALTER TABLE `core_conciliacao_vinculos` ADD CONSTRAINT `ck_core_conciliacao_vinculo_totais` CHECK (`totalExtrato` > 0 AND `totalRazao` > 0);
