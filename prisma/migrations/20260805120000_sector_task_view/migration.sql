-- Personalização da tela /tarefas por setor, definida pelo SUPER_ADMIN.
--
-- Sem backfill: ausência de linha significa "padrão do catálogo" (todos os
-- blocos visíveis), que é exatamente o comportamento de antes desta tabela.

-- CreateTable
CREATE TABLE `sector_task_views` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `widgets` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sector_task_views_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `sector_task_views_tenantId_sectorCode_key`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sector_task_views` ADD CONSTRAINT `sector_task_views_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
