-- Processos societários nos Quadros e abertura automática por setor
-- (27/11/2026, funcionalidade-844 e funcionalidade-872).
--
-- - `pipeline_items.processId`: o cartão que acompanha um processo; único, um
--   cartão por processo. Apagar o processo solta o cartão (SET NULL).
-- - `systemKey` em espaços, listas e colunas: preenchido = criado pelo sistema
--   (o espaço "Processos" e a lista "Processos societários", com uma coluna por
--   situação do processo). Nulo = criado pela equipe.
-- - `aberturas_automaticas`: por setor e origem, em qual lista a origem vira
--   cartão e se está ligada. Sem linha = o padrão.
--
-- Só colunas opcionais e uma tabela nova; não altera nem preenche registro
-- existente. Os cartões dos processos que já existem nascem depois, na
-- reconciliação do agendador interno (a cada 15 minutos).

-- AlterTable
ALTER TABLE `spaces` ADD COLUMN `systemKey` VARCHAR(60) NULL;

-- AlterTable
ALTER TABLE `pipelines` ADD COLUMN `systemKey` VARCHAR(60) NULL;

-- AlterTable
ALTER TABLE `pipeline_stages` ADD COLUMN `systemKey` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `pipeline_items` ADD COLUMN `processId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `aberturas_automaticas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `origem` ENUM('PROCESSO_SOCIETARIO') NOT NULL,
    `pipelineId` VARCHAR(191) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `criadoPorId` VARCHAR(191) NULL,
    `atualizadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `aberturas_automaticas_pipelineId_idx`(`pipelineId`),
    UNIQUE INDEX `aberturas_automaticas_tenantId_sectorCode_origem_key`(`tenantId`, `sectorCode`, `origem`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `spaces_tenantId_sectorCode_systemKey_key` ON `spaces`(`tenantId`, `sectorCode`, `systemKey`);

-- CreateIndex
CREATE UNIQUE INDEX `pipelines_tenantId_sectorCode_systemKey_key` ON `pipelines`(`tenantId`, `sectorCode`, `systemKey`);

-- CreateIndex
CREATE UNIQUE INDEX `pipeline_stages_pipelineId_systemKey_key` ON `pipeline_stages`(`pipelineId`, `systemKey`);

-- CreateIndex
CREATE UNIQUE INDEX `pipeline_items_processId_key` ON `pipeline_items`(`processId`);

-- AddForeignKey
ALTER TABLE `pipeline_items` ADD CONSTRAINT `pipeline_items_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aberturas_automaticas` ADD CONSTRAINT `aberturas_automaticas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aberturas_automaticas` ADD CONSTRAINT `aberturas_automaticas_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `pipelines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aberturas_automaticas` ADD CONSTRAINT `aberturas_automaticas_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `aberturas_automaticas` ADD CONSTRAINT `aberturas_automaticas_atualizadoPorId_fkey` FOREIGN KEY (`atualizadoPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
