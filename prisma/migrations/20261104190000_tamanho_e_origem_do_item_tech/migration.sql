-- O tamanho do item e a entrega de onde ele veio (04/11/2026, lote D dos
-- ajustes de 03/11 — Entregas da Tech).
-- AlterTable
ALTER TABLE `tech_internal_items` ADD COLUMN `originItemId` VARCHAR(191) NULL,
    ADD COLUMN `size` ENUM('P', 'M', 'G') NULL;

-- CreateIndex
CREATE INDEX `tech_internal_items_originItemId_idx` ON `tech_internal_items`(`originItemId`);

-- AddForeignKey
ALTER TABLE `tech_internal_items` ADD CONSTRAINT `tech_internal_items_originItemId_fkey` FOREIGN KEY (`originItemId`) REFERENCES `tech_internal_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

