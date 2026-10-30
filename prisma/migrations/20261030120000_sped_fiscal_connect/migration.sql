-- CreateTable
CREATE TABLE `sped_fiscal_roots` (
    `tenantId` VARCHAR(191) NOT NULL,
    `raiz` VARCHAR(8) NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`, `raiz`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_profiles` (
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`, `companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_documents` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `identity` VARCHAR(160) NOT NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `data` JSON NOT NULL,
    `sourceName` VARCHAR(255) NOT NULL,
    `sourcePath` VARCHAR(500) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sped_fiscal_documents_tenantId_identity_key`(`tenantId`, `identity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_items` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `data` JSON NOT NULL,

    UNIQUE INDEX `sped_fiscal_items_tenantId_documentId_position_key`(`tenantId`, `documentId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_books` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(36) NOT NULL,
    `competence` VARCHAR(7) NOT NULL,
    `direction` VARCHAR(7) NOT NULL,

    INDEX `sped_fiscal_books_tenantId_companyId_competence_idx`(`tenantId`, `companyId`, `competence`),
    UNIQUE INDEX `sped_fiscal_books_tenantId_companyId_documentId_key`(`tenantId`, `companyId`, `documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_support` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `identity` VARCHAR(160) NOT NULL,
    `competence` VARCHAR(7) NOT NULL,
    `data` JSON NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sped_fiscal_support_tenantId_companyId_competence_idx`(`tenantId`, `companyId`, `competence`),
    UNIQUE INDEX `sped_fiscal_support_tenantId_companyId_identity_key`(`tenantId`, `companyId`, `identity`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_decisions` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `raiz` VARCHAR(8) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `data` JSON NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sped_fiscal_decisions_tenantId_raiz_type_key_key`(`tenantId`, `raiz`, `type`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_periods` (
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `competence` VARCHAR(7) NOT NULL,
    `data` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`, `companyId`, `competence`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_calculations` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `period` VARCHAR(7) NOT NULL,
    `scope` VARCHAR(12) NOT NULL,
    `revision` INTEGER NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sped_fiscal_calculations_revision_key`(`tenantId`, `companyId`, `period`, `scope`, `revision`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_revisions` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `raiz` VARCHAR(8) NOT NULL,
    `competence` VARCHAR(7) NOT NULL,
    `obligation` VARCHAR(20) NOT NULL,
    `revision` INTEGER NOT NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `data` JSON NOT NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `requestKey` VARCHAR(100) NOT NULL,
    `remoteUploadId` VARCHAR(100) NULL,
    `remotePackageId` VARCHAR(100) NULL,
    `remoteExecutionId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sped_fiscal_revisions_tenantId_companyId_competence_idx`(`tenantId`, `companyId`, `competence`),
    UNIQUE INDEX `sped_fiscal_revisions_tenantId_requestKey_key`(`tenantId`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sped_fiscal_imports` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `path` VARCHAR(500) NOT NULL,
    `state` VARCHAR(20) NOT NULL DEFAULT 'pendente',
    `cursor` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL DEFAULT 0,
    `results` JSON NOT NULL,
    `leaseOwner` VARCHAR(36) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sped_fiscal_imports_tenantId_companyId_createdAt_idx`(`tenantId`, `companyId`, `createdAt`),
    UNIQUE INDEX `sped_fiscal_imports_tenantId_companyId_sha256_key`(`tenantId`, `companyId`, `sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

