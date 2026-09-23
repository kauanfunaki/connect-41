-- Certificados digitais (A1): só metadado — documento, titular, vencimento e a
-- entrada do cofre. Nem o arquivo nem a senha entram no banco.
--
-- Aditiva: só cria a tabela, nenhuma existente muda. Pode rodar antes do
-- deploy; deploy que chegue antes dela quebra só a tela de certificados.

-- CreateTable
CREATE TABLE `digital_certificates` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `tipo` VARCHAR(4) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `titular` VARCHAR(200) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `cofreEntrada` VARCHAR(200) NULL,
    `conferir` VARCHAR(300) NULL,
    `importedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `digital_certificates_tenantId_expiresAt_idx`(`tenantId`, `expiresAt`),
    INDEX `digital_certificates_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `digital_certificates_tenantId_documento_expiresAt_key`(`tenantId`, `documento`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `digital_certificates` ADD CONSTRAINT `digital_certificates_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `digital_certificates` ADD CONSTRAINT `digital_certificates_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
