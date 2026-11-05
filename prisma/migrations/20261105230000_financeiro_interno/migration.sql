-- Financeiro interno (05/11/2026): estoque de máquinas e materiais do
-- escritório e os contratos e assinaturas que a 41 paga. Três tabelas novas;
-- não altera registros existentes.
-- CreateTable
CREATE TABLE `inventory_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `assetTag` VARCHAR(60) NULL,
    `serialNumber` VARCHAR(120) NULL,
    `location` VARCHAR(120) NULL,
    `holderUserId` VARCHAR(191) NULL,
    `holderName` VARCHAR(120) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DISPONIVEL',
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unit` VARCHAR(20) NOT NULL DEFAULT 'un',
    `minQuantity` INTEGER NULL,
    `purchaseDate` DATE NULL,
    `purchaseValueCents` INTEGER NULL,
    `supplier` VARCHAR(160) NULL,
    `notes` TEXT NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `inventory_items_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `inventory_items_tenantId_category_idx`(`tenantId`, `category`),
    UNIQUE INDEX `inventory_items_tenantId_assetTag_key`(`tenantId`, `assetTag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `holderUserId` VARCHAR(191) NULL,
    `holderName` VARCHAR(120) NULL,
    `location` VARCHAR(120) NULL,
    `note` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdByName` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inventory_movements_tenantId_itemId_createdAt_idx`(`tenantId`, `itemId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internal_contracts` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `supplier` VARCHAR(160) NOT NULL,
    `category` VARCHAR(20) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `cycle` VARCHAR(20) NOT NULL,
    `startDate` DATE NULL,
    `endDate` DATE NULL,
    `renewalDate` DATE NULL,
    `autoRenew` BOOLEAN NOT NULL DEFAULT false,
    `ownerUserId` VARCHAR(191) NULL,
    `ownerName` VARCHAR(120) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
    `url` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `internal_contracts_tenantId_status_renewalDate_idx`(`tenantId`, `status`, `renewalDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `inventory_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internal_contracts` ADD CONSTRAINT `internal_contracts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

