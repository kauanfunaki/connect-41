-- Aditiva (29/10/2026): o sistema de um item do Controle interno passa a vir do
-- Ops Center (robô, site ou app). O cadastro próprio (`tech_internal_tools`) e o
-- `toolId` continuam, só para os vínculos já gravados. O índice novo em
-- `tech_internal_changes` atende o histórico geral do módulo. Não remove dados.
-- AlterTable
ALTER TABLE `tech_internal_items` ADD COLUMN `opsWatcherSlug` VARCHAR(60) NULL,
    ADD COLUMN `opsSiteId` VARCHAR(191) NULL,
    ADD COLUMN `opsAppId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ops_sites_tenantId_id_key` ON `ops_sites`(`tenantId`, `id`);

-- CreateIndex
CREATE UNIQUE INDEX `ops_apps_tenantId_id_key` ON `ops_apps`(`tenantId`, `id`);

-- CreateIndex
CREATE INDEX `tech_internal_items_tenantId_opsWatcherSlug_idx` ON `tech_internal_items`(`tenantId`, `opsWatcherSlug`);

-- CreateIndex
CREATE INDEX `tech_internal_items_tenantId_opsSiteId_idx` ON `tech_internal_items`(`tenantId`, `opsSiteId`);

-- CreateIndex
CREATE INDEX `tech_internal_items_tenantId_opsAppId_idx` ON `tech_internal_items`(`tenantId`, `opsAppId`);

-- CreateIndex
CREATE INDEX `tech_internal_changes_tenantId_createdAt_idx` ON `tech_internal_changes`(`tenantId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `tech_internal_items` ADD CONSTRAINT `tech_internal_items_tenantId_opsWatcherSlug_fkey` FOREIGN KEY (`tenantId`, `opsWatcherSlug`) REFERENCES `ops_watchers`(`tenantId`, `slug`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_items` ADD CONSTRAINT `tech_internal_items_tenantId_opsSiteId_fkey` FOREIGN KEY (`tenantId`, `opsSiteId`) REFERENCES `ops_sites`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_items` ADD CONSTRAINT `tech_internal_items_tenantId_opsAppId_fkey` FOREIGN KEY (`tenantId`, `opsAppId`) REFERENCES `ops_apps`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
