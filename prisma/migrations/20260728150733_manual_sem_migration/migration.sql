-- O banco do zero pelas migrations (lote 5, 28/10/2026). `manual_documents` e
-- `manual_pages` entraram na produção antes de as migrations virarem regra, e
-- a migration seguinte (`manual_page_cover`) altera `manual_pages`: num banco
-- vazio a cadeia parava aqui. Cria as duas na forma de antes da capa.
--
-- Na produção as tabelas já existem: IF NOT EXISTS faz desta migration um
-- nada. As chaves estrangeiras vão dentro do CREATE para ficarem no mesmo IF.

CREATE TABLE IF NOT EXISTS `manual_documents` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `icon` VARCHAR(8) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `manual_documents_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`),
    CONSTRAINT `manual_documents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `manual_documents_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `manual_pages` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `content` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `manual_pages_tenantId_documentId_idx`(`tenantId`, `documentId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `manual_pages_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `manual_pages_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `manual_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `manual_pages_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
