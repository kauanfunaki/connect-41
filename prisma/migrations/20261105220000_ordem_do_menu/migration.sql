-- A ordem das telas no menu de cada setor (05/11/2026): o super admin ordena
-- grupos e telas em Configurações › Organizar menu. Tabela nova; não altera
-- registros existentes. Sem linha, o menu segue a ordem do catálogo.
-- CreateTable
CREATE TABLE `sector_menu_orders` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `ordem` TEXT NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sector_menu_orders_tenantId_sectorCode_key`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sector_menu_orders` ADD CONSTRAINT `sector_menu_orders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

