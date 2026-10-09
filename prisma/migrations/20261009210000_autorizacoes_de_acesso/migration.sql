-- Autorizações de Acesso da Receita Federal (a antiga procuração do e-CAC), uma por
-- raiz de CNPJ ou CPF, e quem as recebe. A ficha da empresa lê a tabela: rodar ANTES do deploy.
-- CreateTable
CREATE TABLE `access_authorizations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `status` ENUM('REQUESTED', 'PENDING_VALIDATION', 'ACTIVE', 'CANCELLED', 'NOT_APPLICABLE') NOT NULL,
    `requestedAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,
    `validatedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `allServices` BOOLEAN NOT NULL DEFAULT true,
    `services` VARCHAR(500) NULL,
    `notes` TEXT NULL,
    `checkedVia` VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    `checkedAt` DATETIME(3) NULL,
    `updatedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `access_authorizations_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `access_authorizations_tenantId_expiresAt_idx`(`tenantId`, `expiresAt`),
    UNIQUE INDEX `access_authorizations_tenantId_documento_key`(`tenantId`, `documento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `access_authorizations` ADD CONSTRAINT `access_authorizations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE `access_authorization_grantees` (
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `cnpj` VARCHAR(14) NOT NULL,
    `updatedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `access_authorization_grantees` ADD CONSTRAINT `access_authorization_grantees_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

