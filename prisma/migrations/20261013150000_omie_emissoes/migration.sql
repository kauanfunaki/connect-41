-- Emissão de NFS-e pelo Connect via Omie (Fase 2 do plano do Omie, 13/10/2026).
-- Só cria a tabela nova `omie_emissoes`; nenhuma tabela existente muda.
-- A tela "Emitir NFS-e" e o cron `/api/cron/omie-emissoes` leem a tabela: rodar ANTES do deploy
-- (`npx prisma migrate deploy`).
-- CreateTable
CREATE TABLE `omie_emissoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('NFSE') NOT NULL DEFAULT 'NFSE',
    `estado` ENUM('ENVIANDO', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA') NOT NULL DEFAULT 'ENVIANDO',
    `tomadorCodigoOmie` VARCHAR(20) NOT NULL,
    `tomadorNome` VARCHAR(180) NOT NULL,
    `tomadorDocumento` VARCHAR(14) NULL,
    `servicoCodigoOmie` VARCHAR(20) NOT NULL,
    `servicoDescricao` VARCHAR(180) NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `competencia` VARCHAR(7) NOT NULL,
    `descricao` TEXT NULL,
    `pedidoPorId` VARCHAR(191) NOT NULL,
    `omieCodigoOS` VARCHAR(20) NULL,
    `omieNumeroOS` VARCHAR(20) NULL,
    `nfseNumero` VARCHAR(20) NULL,
    `nfseCodigoVerificacao` VARCHAR(50) NULL,
    `nfseCnpjPrestador` VARCHAR(14) NULL,
    `nfseUrl` TEXT NULL,
    `ambiente` VARCHAR(1) NULL,
    `faturadaEm` DATETIME(3) NULL,
    `mensagem` TEXT NULL,
    `ultimaConsultaEm` DATETIME(3) NULL,
    `consultas` INTEGER NOT NULL DEFAULT 0,
    `canceladaEm` DATETIME(3) NULL,
    `canceladaPorId` VARCHAR(191) NULL,
    `fiscalDocumentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `omie_emissoes_fiscalDocumentId_key`(`fiscalDocumentId`),
    INDEX `omie_emissoes_tenantId_companyId_createdAt_idx`(`tenantId`, `companyId`, `createdAt`),
    INDEX `omie_emissoes_estado_createdAt_idx`(`estado`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `omie_emissoes` ADD CONSTRAINT `omie_emissoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `omie_emissoes` ADD CONSTRAINT `omie_emissoes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `omie_emissoes` ADD CONSTRAINT `omie_emissoes_fiscalDocumentId_fkey` FOREIGN KEY (`fiscalDocumentId`) REFERENCES `fiscal_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

