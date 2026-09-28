-- Recrutador vê todas as vagas; o coordenador do Recrutamento pode restringir (28/09).
-- AlterTable
ALTER TABLE `vagas` ADD COLUMN `restrictedToRecruiters` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `vaga_recrutadores` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `vagaId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vaga_recrutadores_tenantId_userId_idx`(`tenantId`, `userId`),
    UNIQUE INDEX `vaga_recrutadores_vagaId_userId_key`(`vagaId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `vaga_recrutadores` ADD CONSTRAINT `vaga_recrutadores_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vaga_recrutadores` ADD CONSTRAINT `vaga_recrutadores_vagaId_fkey` FOREIGN KEY (`vagaId`) REFERENCES `vagas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vaga_recrutadores` ADD CONSTRAINT `vaga_recrutadores_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vaga_recrutadores` ADD CONSTRAINT `vaga_recrutadores_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

