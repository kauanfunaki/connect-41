-- A geração do SPED pela fila do Connect (06/11/2026): o agente do motor busca
-- a tarefa (`robot_tasks`, tipo `gerar_sped`) e devolve o TXT. Tabela nova,
-- sem tocar nas que existem.

-- CreateTable
CREATE TABLE `sped_fiscal_generations` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `revisionId` VARCHAR(36) NOT NULL,
    `robotTaskId` VARCHAR(36) NOT NULL,
    `raiz` VARCHAR(8) NOT NULL,
    `competence` VARCHAR(7) NOT NULL,
    `obligation` VARCHAR(20) NOT NULL,
    `fileName` VARCHAR(200) NULL,
    `filePath` VARCHAR(500) NULL,
    `fileSha256` CHAR(64) NULL,
    `fileBytes` INTEGER NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sped_fiscal_generations_revisionId_key`(`revisionId`),
    UNIQUE INDEX `sped_fiscal_generations_robotTaskId_key`(`robotTaskId`),
    INDEX `sped_fiscal_generations_tenantId_companyId_competence_idx`(`tenantId`, `companyId`, `competence`),
    INDEX `sped_fiscal_generations_tenantId_raiz_competence_idx`(`tenantId`, `raiz`, `competence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
