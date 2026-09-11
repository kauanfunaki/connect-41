-- CreateTable
CREATE TABLE `dre_imports` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `ano` INTEGER NOT NULL,
    `mes` INTEGER NOT NULL,
    `origem` ENUM('PAGAMENTO', 'RECEBIMENTO') NOT NULL,
    `arquivo` VARCHAR(255) NOT NULL,
    `linhasNoArquivo` INTEGER NOT NULL,
    `linhasLidas` INTEGER NOT NULL,
    `importedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dre_imports_tenantId_companyId_ano_idx`(`tenantId`, `companyId`, `ano`),
    UNIQUE INDEX `dre_imports_companyId_ano_mes_origem_key`(`companyId`, `ano`, `mes`, `origem`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dre_import_lines` (
    `id` VARCHAR(191) NOT NULL,
    `importId` VARCHAR(191) NOT NULL,
    `data` DATETIME(3) NOT NULL,
    `categoria` VARCHAR(200) NULL,
    `valorCentavos` INTEGER NOT NULL,

    INDEX `dre_import_lines_importId_idx`(`importId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dre_imports` ADD CONSTRAINT `dre_imports_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dre_imports` ADD CONSTRAINT `dre_imports_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dre_import_lines` ADD CONSTRAINT `dre_import_lines_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `dre_imports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

