-- A pasta de rede ligada aos Arquivos (21/10/2026): o piloto por empresa e o
-- registro do que o robô já trouxe. Ver src/lib/drive/pastaDeRede.ts.
ALTER TABLE `companies` ADD COLUMN `pastaDeRedeNoDrive` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `drive_network_files` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `relativePath` VARCHAR(500) NOT NULL,
    `pathHash` CHAR(64) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `watcherSlug` VARCHAR(80) NOT NULL,
    `driveFileId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `drive_network_files_tenantId_companyId_pathHash_sha256_key`(`tenantId`, `companyId`, `pathHash`, `sha256`),
    INDEX `drive_network_files_tenantId_companyId_createdAt_idx`(`tenantId`, `companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `drive_network_files` ADD CONSTRAINT `drive_network_files_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
