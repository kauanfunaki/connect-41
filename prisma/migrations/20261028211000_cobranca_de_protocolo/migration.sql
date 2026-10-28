-- Lote 5 (28/10/2026): o prazo para cobrar o órgão do protocolo parado, por
-- escritório. Tabela nova; não altera registros existentes.
-- CreateTable
CREATE TABLE `tenant_societario_configs` (
    `tenantId` VARCHAR(191) NOT NULL,
    `cobrarProtocoloAposDias` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_societario_configs` ADD CONSTRAINT `tenant_societario_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

