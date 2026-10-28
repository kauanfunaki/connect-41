-- O Meu dia de cada pessoa (28/10/2026): os blocos que ela vê quando tem
-- configuração própria, que vale mais que a do setor. Tabela nova; não altera
-- registros existentes.
-- CreateTable
CREATE TABLE `user_task_views` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `widgets` TEXT NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_task_views_userId_key`(`userId`),
    INDEX `user_task_views_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_task_views` ADD CONSTRAINT `user_task_views_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

