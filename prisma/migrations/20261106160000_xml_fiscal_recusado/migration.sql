-- XML fiscal recusado pelo leitor (06/11/2026): a recusa deixa de se perder e
-- passa a ser contada por município — o passo 1 da NFS-e fora do ABRASF e do
-- padrão nacional. Tabela nova, sem tocar nas que existem.

-- CreateTable
CREATE TABLE `fiscal_xml_refusals` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `source` VARCHAR(20) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `detail` VARCHAR(500) NOT NULL,
    `probableType` VARCHAR(20) NOT NULL,
    `rootTag` VARCHAR(80) NULL,
    `municipalityCode` CHAR(7) NULL,
    `xml` MEDIUMTEXT NULL,
    `timesSeen` INTEGER NOT NULL DEFAULT 1,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenById` VARCHAR(191) NULL,

    INDEX `fiscal_xml_refusals_tenantId_probableType_municipalityCode_idx`(`tenantId`, `probableType`, `municipalityCode`),
    INDEX `fiscal_xml_refusals_tenantId_lastSeenAt_idx`(`tenantId`, `lastSeenAt`),
    UNIQUE INDEX `fiscal_xml_refusals_tenantId_sha256_key`(`tenantId`, `sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
