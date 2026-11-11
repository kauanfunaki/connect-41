-- Repositório de fluxos (10/11/2026, pedido do Kauan): os fluxogramas e as
-- metodologias de cada setor, no Apoio, ao lado das senhas e dos manuais.
--
-- 1. `flow_folders`: as pastas de cada setor (`sectorCode`), como as dos
--    manuais.
-- 2. `flow_docs`: o fluxo — dono, "revisado em", a versão em vigor (0 =
--    ainda sem "Salvar versão"), a metodologia em HTML sanitizado e a lista
--    de etapas (`steps`, JSON). O desenho não é guardado: sai da lista.
-- 3. `flow_versions`: uma linha por "Salvar versão N", com a foto da lista,
--    da metodologia e o nome de quem salvou.
-- 4. `flow_attachments`: os arquivos anexados (PDF, imagem, .drawio). O
--    arquivo mora em `storage/fluxos/<tenantId>/`, no volume do EasyPanel.
--
-- Os ids de pessoa não têm chave estrangeira (como na Academia): a exclusão
-- de usuário os mantém. Excluir a pasta leva os fluxos, e excluir o fluxo
-- leva as versões e os anexos (ON DELETE CASCADE).
--
-- Só acrescenta: quatro tabelas novas, nenhuma coluna mexida. Rodar ANTES do
-- deploy: o módulo nasce ligado, e /fluxos lê estas tabelas.

-- CreateTable
CREATE TABLE `flow_folders` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `icon` VARCHAR(8) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `flow_folders_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flow_docs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `reviewedAt` DATE NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `methodology` TEXT NULL,
    `steps` JSON NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `flow_docs_tenantId_folderId_idx`(`tenantId`, `folderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flow_versions` (
    `id` VARCHAR(191) NOT NULL,
    `flowDocId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `steps` JSON NOT NULL,
    `methodology` TEXT NULL,
    `reviewedAt` DATE NULL,
    `savedById` VARCHAR(191) NOT NULL,
    `savedByName` VARCHAR(160) NOT NULL,
    `savedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `flow_versions_flowDocId_version_key`(`flowDocId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `flow_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `flowDocId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(200) NOT NULL,
    `mime` VARCHAR(80) NOT NULL,
    `size` INTEGER NOT NULL,
    `storagePath` VARCHAR(255) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `flow_attachments_flowDocId_idx`(`flowDocId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `flow_folders` ADD CONSTRAINT `flow_folders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `flow_docs` ADD CONSTRAINT `flow_docs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `flow_docs` ADD CONSTRAINT `flow_docs_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `flow_folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `flow_versions` ADD CONSTRAINT `flow_versions_flowDocId_fkey` FOREIGN KEY (`flowDocId`) REFERENCES `flow_docs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `flow_attachments` ADD CONSTRAINT `flow_attachments_flowDocId_fkey` FOREIGN KEY (`flowDocId`) REFERENCES `flow_docs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
