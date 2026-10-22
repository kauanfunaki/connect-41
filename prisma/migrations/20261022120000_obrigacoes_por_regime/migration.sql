-- Obrigações por regime (22/10/2026): o modelo de obrigação do setor, com a
-- regra de aplicação à carteira, e o registro de cada obrigação concreta que o
-- motor gerou (src/lib/obrigacoes/geracao.ts). Nenhum modelo vem cadastrado.
--
-- A chave única de `obrigacoes_geradas` (modelo + empresa + competência) é o
-- que torna a geração idempotente: 191*4 + 191*4 + 7*4 = 1.556 bytes em
-- utf8mb4, abaixo do limite de 3.072 do InnoDB.

-- CreateTable
CREATE TABLE `modelos_de_obrigacao` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(160) NOT NULL,
    `descricao` TEXT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `pipelineId` VARCHAR(191) NOT NULL,
    `periodicidade` ENUM('MENSAL', 'TRIMESTRAL', 'ANUAL') NOT NULL DEFAULT 'MENSAL',
    `mesesAposCompetencia` INTEGER NOT NULL DEFAULT 1,
    `diaLegal` INTEGER NULL,
    `diasUteisAntes` INTEGER NOT NULL DEFAULT 0,
    `ajuste` ENUM('ANTECIPAR', 'ADIAR') NOT NULL DEFAULT 'ADIAR',
    `regimes` JSON NULL,
    `semMovimento` ENUM('QUALQUER', 'SIM', 'NAO') NOT NULL DEFAULT 'QUALQUER',
    `comFuncionarios` ENUM('QUALQUER', 'SIM', 'NAO') NOT NULL DEFAULT 'QUALQUER',
    `estados` JSON NULL,
    `cidades` JSON NULL,
    `exigeSetorContratado` BOOLEAN NOT NULL DEFAULT true,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `modelos_de_obrigacao_tenantId_active_idx`(`tenantId`, `active`),
    INDEX `modelos_de_obrigacao_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `obrigacoes_geradas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `modeloId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competencia` VARCHAR(7) NOT NULL,
    `dataLegal` VARCHAR(10) NOT NULL,
    `prazoInterno` VARCHAR(10) NOT NULL,
    `pipelineItemId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `obrigacoes_geradas_pipelineItemId_key`(`pipelineItemId`),
    INDEX `obrigacoes_geradas_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `obrigacoes_geradas_modeloId_companyId_competencia_key`(`modeloId`, `companyId`, `competencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `modelos_de_obrigacao` ADD CONSTRAINT `modelos_de_obrigacao_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `modelos_de_obrigacao` ADD CONSTRAINT `modelos_de_obrigacao_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `pipelines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `obrigacoes_geradas` ADD CONSTRAINT `obrigacoes_geradas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `obrigacoes_geradas` ADD CONSTRAINT `obrigacoes_geradas_modeloId_fkey` FOREIGN KEY (`modeloId`) REFERENCES `modelos_de_obrigacao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `obrigacoes_geradas` ADD CONSTRAINT `obrigacoes_geradas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `obrigacoes_geradas` ADD CONSTRAINT `obrigacoes_geradas_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

