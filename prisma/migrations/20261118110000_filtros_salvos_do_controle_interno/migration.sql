-- Controle interno: filtros salvos por pessoa (18/11/2026, funcionalidade-783).
-- Só acrescenta uma tabela nova; nenhuma linha antiga é alterada.
--
-- Rodar ANTES da publicação: a lista do Controle interno passa a ler os
-- filtros salvos de quem está vendo.

-- CreateTable
CREATE TABLE `tech_internal_saved_filters` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `query` VARCHAR(2000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tech_internal_saved_filters_tenantId_userId_idx`(`tenantId`, `userId`),
    INDEX `tech_internal_saved_filters_userId_idx`(`userId`),
    UNIQUE INDEX `tech_internal_saved_filters_tenantId_userId_name_key`(`tenantId`, `userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tech_internal_saved_filters` ADD CONSTRAINT `tech_internal_saved_filters_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_saved_filters` ADD CONSTRAINT `tech_internal_saved_filters_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
