-- CreateTable
CREATE TABLE `spaces` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `sectorCode` VARCHAR(40) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `color` VARCHAR(7) NOT NULL DEFAULT '#586577',
  `order` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `spaces_tenantId_sectorCode_name_key`(`tenantId`, `sectorCode`, `name`),
  INDEX `spaces_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `folders` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `spaceId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `order` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `folders_tenantId_spaceId_idx`(`tenantId`, `spaceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `spaces` ADD CONSTRAINT `spaces_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `folders` ADD CONSTRAINT `folders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `folders` ADD CONSTRAINT `folders_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `spaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: adiciona colunas nullable primeiro, pra poder popular Pipelines
-- já existentes com um Space padrão antes de travar NOT NULL.
ALTER TABLE `pipelines`
  ADD COLUMN `spaceId` VARCHAR(191) NULL,
  ADD COLUMN `folderId` VARCHAR(191) NULL;

-- Backfill: 1 Space padrão por (tenantId, sectorCode) que já tem pipeline,
-- nomeado igual ao code do setor (ex. "bpo") — usuário reorganiza depois.
INSERT INTO `spaces` (`id`, `tenantId`, `sectorCode`, `name`, `color`, `order`, `createdAt`, `updatedAt`)
SELECT UUID(), t.tenantId, t.sectorCode, t.sectorCode, '#586577', 0, NOW(3), NOW(3)
FROM (SELECT DISTINCT `tenantId`, `sectorCode` FROM `pipelines`) AS t;

UPDATE `pipelines` p
JOIN `spaces` s ON s.tenantId = p.tenantId AND s.sectorCode = p.sectorCode
SET p.spaceId = s.id
WHERE p.spaceId IS NULL;

-- AlterTable: agora trava NOT NULL + índices/FKs definitivos
ALTER TABLE `pipelines`
  MODIFY COLUMN `spaceId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `pipelines_spaceId_idx` ON `pipelines`(`spaceId`);
CREATE INDEX `pipelines_folderId_idx` ON `pipelines`(`folderId`);

-- AddForeignKey
ALTER TABLE `pipelines` ADD CONSTRAINT `pipelines_spaceId_fkey` FOREIGN KEY (`spaceId`) REFERENCES `spaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `pipelines` ADD CONSTRAINT `pipelines_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
