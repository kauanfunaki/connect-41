-- AlterTable: novo valor de enum + coluna templateId em assessment_links
ALTER TABLE `assessment_links` MODIFY `type` ENUM('DISC', 'MULTIPLA_ESCOLHA') NOT NULL DEFAULT 'DISC';
ALTER TABLE `assessment_links` ADD COLUMN `templateId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `assessment_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(400) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `assessment_templates_tenantId_sectorCode_active_idx`(`tenantId`, `sectorCode`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_template_questions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,
    `text` VARCHAR(500) NOT NULL,
    `options` JSON NOT NULL,
    `correctIndex` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `assessment_template_questions_templateId_order_idx`(`templateId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `assessment_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_templates` ADD CONSTRAINT `assessment_templates_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_templates` ADD CONSTRAINT `assessment_templates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_template_questions` ADD CONSTRAINT `assessment_template_questions_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `assessment_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
