-- Até quando a equipe viu os envios do cliente, por pasta (o "!" da lista de empresas dos Arquivos).
-- A tela inicial dos Arquivos lê a tabela: rodar ANTES do deploy.
-- CreateTable
CREATE TABLE `drive_folder_seen` (
    `folderId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL,
    `seenByUserId` VARCHAR(191) NULL,

    INDEX `drive_folder_seen_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`folderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `drive_folder_seen` ADD CONSTRAINT `drive_folder_seen_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `drive_folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

