-- AlterTable
ALTER TABLE `chatwoot_connections` ADD COLUMN `integrationId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sped_sync_states` ADD COLUMN `integrationId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `chatwoot_connections` ADD CONSTRAINT `chatwoot_connections_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `tenant_integrations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sped_sync_states` ADD CONSTRAINT `sped_sync_states_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `tenant_integrations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

