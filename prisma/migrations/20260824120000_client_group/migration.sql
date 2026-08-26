-- AlterTable
ALTER TABLE `companies` ADD COLUMN `clientGroupId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `client_groups` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `cnpjRoot` VARCHAR(8) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `client_groups_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `companies_tenantId_clientGroupId_idx` ON `companies`(`tenantId`, `clientGroupId`);

-- AddForeignKey
ALTER TABLE `client_groups` ADD CONSTRAINT `client_groups_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `companies` ADD CONSTRAINT `companies_clientGroupId_fkey` FOREIGN KEY (`clientGroupId`) REFERENCES `client_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
