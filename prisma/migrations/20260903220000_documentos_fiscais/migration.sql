-- Documentos Fiscais no Connect — etapa 1 da Fase 2.
--
-- Espelho do acervo já emitido. O módulo NÃO emite documento: reflete, aceita o
-- que falta (deduplicando) e vira lançamento, como o Omie. Emissão está em
-- standby desde 2026-08-21.
--
-- Puramente aditiva: uma tabela nova e quatro enums. Nada existente é tocado.
--
-- Três decisões que a tabela carrega, e que o protótipo não podia tomar:
--
-- 1. TRÊS EIXOS DE ESTADO, não um status. `origin` (de onde veio), `situation`
--    (o que a SEFAZ diz) e `destination` (o que o BPO decidiu) são
--    independentes. Com um campo só, "cancelada" e "lançada" competiriam pela
--    mesma coluna — e a nota cancelada DEPOIS de lançada, que é o caso que dói,
--    não teria como ser representada.
--
-- 2. A UNICIDADE É `dedupKey`, NÃO a chave de acesso. NFS-e é municipal e não
--    tem chave nacional; a dedupKey dela é composta
--    (NFSE:{CNPJ}:{série}:{número}:{competência}). Por tenant, não global: dois
--    escritórios podem espelhar a mesma nota do mesmo cliente sem conflito.
--
-- 3. `amount` É Decimal(12,2), NÃO Float. O protótipo usa Float por limitação
--    do SQLite. Aqui o centavo tem de fechar com o que o cliente pagou.

-- CreateTable
CREATE TABLE `fiscal_documents` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('NFE', 'NFCE', 'CTE', 'NFSE') NOT NULL,
    `accessKey` VARCHAR(44) NULL,
    `dedupKey` VARCHAR(120) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `series` VARCHAR(10) NULL,
    `issuerName` VARCHAR(180) NOT NULL,
    `issuerDocument` VARCHAR(14) NOT NULL,
    `recipientName` VARCHAR(180) NULL,
    `recipientDocument` VARCHAR(14) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `competence` VARCHAR(7) NOT NULL,
    `origin` ENUM('SPED', 'UPLOAD') NOT NULL,
    `situation` ENUM('AUTORIZADA', 'CANCELADA') NOT NULL DEFAULT 'AUTORIZADA',
    `destination` ENUM('PENDENTE', 'LANCADO', 'IGNORADO') NOT NULL DEFAULT 'PENDENTE',
    `ignoredReason` VARCHAR(255) NULL,
    `filePath` VARCHAR(255) NULL,
    `uploadedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `fiscal_documents_tenantId_companyId_competence_idx`(`tenantId`, `companyId`, `competence`),
    INDEX `fiscal_documents_tenantId_companyId_destination_idx`(`tenantId`, `companyId`, `destination`),
    INDEX `fiscal_documents_tenantId_accessKey_idx`(`tenantId`, `accessKey`),
    UNIQUE INDEX `fiscal_documents_tenantId_dedupKey_key`(`tenantId`, `dedupKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `fiscal_documents` ADD CONSTRAINT `fiscal_documents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `fiscal_documents` ADD CONSTRAINT `fiscal_documents_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `fiscal_documents` ADD CONSTRAINT `fiscal_documents_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
