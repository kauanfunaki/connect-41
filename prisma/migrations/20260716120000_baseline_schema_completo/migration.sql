-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `cnpj` VARCHAR(18) NULL,
    `slug` VARCHAR(60) NOT NULL,
    `plan` VARCHAR(40) NOT NULL DEFAULT 'starter',
    `managementMode` ENUM('MANAGED', 'SELF_SERVICE') NOT NULL DEFAULT 'MANAGED',
    `logoUrl` VARCHAR(255) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenants_cnpj_key`(`cnpj`),
    UNIQUE INDEX `tenants_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_tenant_access` (
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `branches_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sectors` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `color` VARCHAR(7) NOT NULL DEFAULT '#586577',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sectors_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `sectors_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_modules` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `moduleCode` VARCHAR(60) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tenant_modules_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `tenant_modules_tenantId_moduleCode_key`(`tenantId`, `moduleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `managementMode` ENUM('MANAGED', 'SELF_SERVICE') NOT NULL,
    `billingType` ENUM('FLAT_MONTHLY', 'PER_USER_MONTHLY') NOT NULL,
    `basePrice` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `pricePerUser` DECIMAL(10, 2) NULL,
    `setupFee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` ENUM('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED') NOT NULL DEFAULT 'TRIAL',
    `seatLimit` INTEGER NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `currentPeriodEnd` DATETIME(3) NULL,
    `setupFeeAmount` DECIMAL(10, 2) NULL,
    `setupFeePaidAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_tenantId_key`(`tenantId`),
    INDEX `subscriptions_planId_idx`(`planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(120) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `photoUrl` VARCHAR(255) NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'SECTOR_ADMIN', 'SECTOR_USER', 'READONLY') NOT NULL DEFAULT 'SECTOR_USER',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `users_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `users_tenantId_email_key`(`tenantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sectors` (
    `userId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,

    PRIMARY KEY (`userId`, `sectorCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    INDEX `refresh_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `password_reset_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `companies` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `tradeName` VARCHAR(180) NULL,
    `cnpj` VARCHAR(18) NULL,
    `taxRegime` VARCHAR(60) NULL,
    `externalId` VARCHAR(60) NULL,
    `foundationDate` DATETIME(3) NULL,
    `zipCode` VARCHAR(10) NULL,
    `addressStreet` VARCHAR(180) NULL,
    `addressNumber` VARCHAR(20) NULL,
    `addressComplement` VARCHAR(80) NULL,
    `neighborhood` VARCHAR(80) NULL,
    `city` VARCHAR(80) NULL,
    `stateCode` VARCHAR(2) NULL,
    `stateRegistration` VARCHAR(40) NULL,
    `municipalRegistration` VARCHAR(40) NULL,
    `nire` VARCHAR(20) NULL,
    `email` VARCHAR(120) NULL,
    `phone` VARCHAR(30) NULL,
    `website` VARCHAR(255) NULL,
    `logoUrl` VARCHAR(255) NULL,
    `status` ENUM('PROSPECT', 'ACTIVE', 'INACTIVE', 'CHURNED') NOT NULL DEFAULT 'PROSPECT',
    `source` VARCHAR(80) NULL,
    `responsibleUserId` VARCHAR(191) NULL,
    `branchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `companies_tenantId_idx`(`tenantId`),
    INDEX `companies_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_services` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `responsibleUserId` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `company_services_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    UNIQUE INDEX `company_services_companyId_sectorCode_key`(`companyId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `people` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `cpf` VARCHAR(14) NULL,
    `email` VARCHAR(120) NULL,
    `phone` VARCHAR(30) NULL,
    `photoUrl` VARCHAR(255) NULL,
    `birthDate` DATETIME(3) NULL,
    `type` ENUM('CANDIDATO', 'COLABORADOR') NOT NULL DEFAULT 'CANDIDATO',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `currentCompanyId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `rg` VARCHAR(20) NULL,
    `pis` VARCHAR(20) NULL,
    `ctps` VARCHAR(20) NULL,
    `ctpsSerie` VARCHAR(10) NULL,
    `admissionDate` DATETIME(3) NULL,
    `dismissalDate` DATETIME(3) NULL,
    `employmentStatus` ENUM('ATIVO', 'DESLIGADO', 'AFASTADO', 'EM_FERIAS', 'ADMISSAO_EM_ANDAMENTO') NOT NULL DEFAULT 'ADMISSAO_EM_ANDAMENTO',
    `cargoId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `monthlyWorkHours` DECIMAL(6, 2) NULL,
    `weeklyWorkHours` DECIMAL(5, 2) NULL,
    `workShift` VARCHAR(60) NULL,
    `currentSalary` DECIMAL(12, 2) NULL,
    `bankName` VARCHAR(80) NULL,
    `bankAgency` VARCHAR(20) NULL,
    `bankAccount` VARCHAR(30) NULL,
    `bankAccountType` VARCHAR(20) NULL,
    `zipCode` VARCHAR(10) NULL,
    `addressStreet` VARCHAR(180) NULL,
    `addressNumber` VARCHAR(20) NULL,
    `addressComplement` VARCHAR(80) NULL,
    `neighborhood` VARCHAR(80) NULL,
    `city` VARCHAR(80) NULL,
    `stateCode` VARCHAR(2) NULL,
    `education` VARCHAR(80) NULL,

    INDEX `people_tenantId_idx`(`tenantId`),
    INDEX `people_tenantId_type_idx`(`tenantId`, `type`),
    UNIQUE INDEX `people_tenantId_cpf_key`(`tenantId`, `cpf`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pipelines` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `entityType` ENUM('COMPANY', 'PERSON') NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `pipelines_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pipeline_stages` (
    `id` VARCHAR(191) NOT NULL,
    `pipelineId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `order` INTEGER NOT NULL,
    `color` VARCHAR(7) NULL,
    `isTerminal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pipeline_stages_pipelineId_order_key`(`pipelineId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pipeline_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `pipelineId` VARCHAR(191) NOT NULL,
    `stageId` VARCHAR(191) NOT NULL,
    `entityType` ENUM('COMPANY', 'PERSON') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `dueDate` DATETIME(3) NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `pipeline_items_tenantId_pipelineId_idx`(`tenantId`, `pipelineId`),
    INDEX `pipeline_items_tenantId_entityType_entityId_idx`(`tenantId`, `entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pipeline_item_assignees` (
    `pipelineItemId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`pipelineItemId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `color` VARCHAR(7) NOT NULL DEFAULT '#586577',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tags_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    UNIQUE INDEX `tags_tenantId_sectorCode_name_key`(`tenantId`, `sectorCode`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pipeline_item_tags` (
    `pipelineItemId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`pipelineItemId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activities` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `pipelineItemId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('NOTE', 'STATUS_CHANGE', 'DOCUMENT', 'HANDOFF', 'MENTION') NOT NULL,
    `content` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activities_tenantId_pipelineItemId_idx`(`tenantId`, `pipelineItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_fields` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `entityType` ENUM('COMPANY', 'PERSON') NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `fieldType` ENUM('TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN', 'TEXTAREA') NOT NULL,
    `options` JSON NULL,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `custom_fields_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    UNIQUE INDEX `custom_fields_tenantId_sectorCode_entityType_key_key`(`tenantId`, `sectorCode`, `entityType`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_values` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `customFieldId` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `value` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `custom_values_tenantId_entityId_idx`(`tenantId`, `entityId`),
    UNIQUE INDEX `custom_values_customFieldId_entityId_key`(`customFieldId`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `departments_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `departments_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cargos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `area` VARCHAR(80) NULL,
    `description` TEXT NULL,
    `technicalRequirements` TEXT NULL,
    `behavioralRequirements` TEXT NULL,
    `salaryRangeMin` DECIMAL(12, 2) NULL,
    `salaryRangeMid` DECIMAL(12, 2) NULL,
    `salaryRangeMax` DECIMAL(12, 2) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cargos_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `cargos_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vagas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `cargoId` VARCHAR(191) NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `responsibleUserId` VARCHAR(191) NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `status` ENUM('ABERTA', 'EM_ANDAMENTO', 'ENCERRADA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
    `priority` ENUM('BAIXA', 'MEDIA', 'ALTA') NOT NULL DEFAULT 'MEDIA',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `vagas_tenantId_sectorCode_status_idx`(`tenantId`, `sectorCode`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `candidaturas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `vagaId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `pipelineItemId` VARCHAR(191) NULL,
    `origin` VARCHAR(80) NULL,
    `resumeUrl` VARCHAR(255) NULL,
    `status` ENUM('EM_ANDAMENTO', 'APROVADO', 'REPROVADO', 'DESISTENTE', 'CONTRATADO', 'ENCERRADO') NOT NULL DEFAULT 'EM_ANDAMENTO',
    `rejectionReason` TEXT NULL,
    `withdrawalReason` TEXT NULL,
    `hiredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `candidaturas_pipelineItemId_key`(`pipelineItemId`),
    INDEX `candidaturas_tenantId_vagaId_idx`(`tenantId`, `vagaId`),
    UNIQUE INDEX `candidaturas_vagaId_personId_key`(`vagaId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exames_admissionais` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `candidaturaId` VARCHAR(191) NULL,
    `clinicName` VARCHAR(120) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `scheduledAt` DATETIME(3) NULL,
    `performedAt` DATETIME(3) NULL,
    `asoDueDate` DATETIME(3) NULL,
    `status` ENUM('SOLICITADO', 'AGENDADO', 'REALIZADO', 'ASO_PENDENTE', 'ASO_APTO', 'ASO_INAPTO', 'ASO_APTO_COM_RESTRICAO') NOT NULL DEFAULT 'SOLICITADO',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `exames_admissionais_tenantId_personId_idx`(`tenantId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `entityType` ENUM('PERSON', 'COMPANY', 'VAGA', 'PIPELINE_ITEM') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `category` ENUM('ADMISSAO', 'ASO', 'CURRICULO', 'ATESTADO', 'CERTIFICADO', 'RECIBO', 'CONTRATO', 'OUTRO') NOT NULL,
    `fileName` VARCHAR(180) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `sensitive` BOOLEAN NOT NULL DEFAULT false,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `documents_tenantId_entityType_entityId_idx`(`tenantId`, `entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_documents` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `bodyHtml` TEXT NOT NULL,
    `fileName` VARCHAR(180) NULL,
    `fileUrl` VARCHAR(255) NULL,
    `mimeType` VARCHAR(100) NULL,
    `fileSize` INTEGER NULL,
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `client_documents_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_document_recipients` (
    `id` VARCHAR(191) NOT NULL,
    `clientDocumentId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(180) NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `firstViewedAt` DATETIME(3) NULL,
    `lastViewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `client_document_recipients_token_key`(`token`),
    INDEX `client_document_recipients_clientDocumentId_idx`(`clientDocumentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_document_views` (
    `id` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `action` ENUM('VIEWED', 'DOWNLOADED') NOT NULL DEFAULT 'VIEWED',
    `ipAddress` VARCHAR(64) NOT NULL,
    `userAgent` VARCHAR(255) NULL,
    `viewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `client_document_views_recipientId_idx`(`recipientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_smtp_configs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `host` VARCHAR(180) NOT NULL,
    `port` INTEGER NOT NULL,
    `secure` BOOLEAN NOT NULL DEFAULT true,
    `username` VARCHAR(180) NOT NULL,
    `passwordEnc` TEXT NOT NULL,
    `fromName` VARCHAR(120) NOT NULL,
    `fromEmail` VARCHAR(180) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_smtp_configs_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `field_permissions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'SECTOR_ADMIN', 'SECTOR_USER', 'READONLY') NOT NULL,
    `fieldGroup` ENUM('DADOS_BANCARIOS', 'DADOS_MEDICOS', 'SALARIO', 'DOCUMENTOS_PESSOAIS') NOT NULL,
    `canView` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `field_permissions_tenantId_role_fieldGroup_key`(`tenantId`, `role`, `fieldGroup`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salary_changes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `previousSalary` DECIMAL(12, 2) NULL,
    `newSalary` DECIMAL(12, 2) NOT NULL,
    `changePercent` DECIMAL(5, 2) NULL,
    `cargoId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `effectiveDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `salary_changes_tenantId_personId_idx`(`tenantId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vacations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `acquisitivePeriodStart` DATETIME(3) NOT NULL,
    `acquisitivePeriodEnd` DATETIME(3) NOT NULL,
    `concessivePeriodStart` DATETIME(3) NULL,
    `concessivePeriodEnd` DATETIME(3) NULL,
    `startDate` DATETIME(3) NULL,
    `returnDate` DATETIME(3) NULL,
    `days` INTEGER NOT NULL DEFAULT 30,
    `cashAllowance` BOOLEAN NOT NULL DEFAULT false,
    `installment` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PLANEJADA', 'SOLICITADA', 'EM_ANALISE', 'APROVADA', 'PROGRAMADA', 'EM_GOZO', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'PLANEJADA',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `vacations_tenantId_personId_idx`(`tenantId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `absences` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `type` ENUM('FALTA', 'ATESTADO_PARCIAL', 'ATESTADO_INTEGRAL', 'LICENCA', 'AFASTAMENTO', 'RETORNO') NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `returnDate` DATETIME(3) NULL,
    `lostDays` INTEGER NULL,
    `lostHours` DECIMAL(6, 2) NULL,
    `reason` TEXT NULL,
    `shift` VARCHAR(60) NULL,
    `location` VARCHAR(120) NULL,
    `professional` VARCHAR(120) NULL,
    `status` ENUM('LANCADO', 'EM_ANALISE', 'APROVADO', 'REPROVADO', 'AFASTADO', 'RETORNO_PREVISTO', 'CONCLUIDO') NOT NULL DEFAULT 'LANCADO',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `absences_tenantId_personId_idx`(`tenantId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `terminations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `type` ENUM('VOLUNTARIO', 'INVOLUNTARIO', 'TERMINO_CONTRATO', 'EXPERIENCIA', 'JUSTA_CAUSA', 'SEM_JUSTA_CAUSA') NOT NULL,
    `reason` TEXT NULL,
    `status` ENUM('SOLICITADO', 'EM_CALCULO', 'DOCUMENTACAO_PENDENTE', 'ASSINATURA_PENDENTE', 'FINALIZADO', 'CANCELADO') NOT NULL DEFAULT 'SOLICITADO',
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finalizedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `terminations_tenantId_personId_idx`(`tenantId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_competencies` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `status` ENUM('PENDENTE', 'EM_CONFERENCIA', 'CONFERIDO', 'ENVIADO', 'PROCESSADO', 'CANCELADO') NOT NULL DEFAULT 'PENDENTE',
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payroll_competencies_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `payroll_competencies_companyId_month_year_key`(`companyId`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_entries` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competencyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `grossSalary` DECIMAL(12, 2) NOT NULL,
    `workedDays` INTEGER NULL,
    `vacationDays` INTEGER NULL,
    `thirteenthSalary` DECIMAL(12, 2) NULL,
    `familyAllowance` DECIMAL(12, 2) NULL,
    `absenceDays` INTEGER NULL,
    `missedDays` INTEGER NULL,
    `overtimeHours` DECIMAL(6, 2) NULL,
    `nightShiftAllowance` DECIMAL(12, 2) NULL,
    `hazardPay` DECIMAL(12, 2) NULL,
    `unhealthyPay` DECIMAL(12, 2) NULL,
    `benefitsTotal` DECIMAL(12, 2) NULL,
    `deductions` DECIMAL(12, 2) NULL,
    `status` ENUM('PENDENTE', 'EM_CONFERENCIA', 'CONFERIDO', 'ENVIADO', 'PROCESSADO', 'CANCELADO') NOT NULL DEFAULT 'PENDENTE',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payroll_entries_tenantId_personId_idx`(`tenantId`, `personId`),
    UNIQUE INDEX `payroll_entries_competencyId_personId_key`(`competencyId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `overtime_entries` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `expectedShift` VARCHAR(60) NULL,
    `checkIn` DATETIME(3) NULL,
    `breakMinutes` INTEGER NULL,
    `checkOut` DATETIME(3) NULL,
    `owedHours` DECIMAL(5, 2) NULL,
    `workedHours` DECIMAL(5, 2) NULL,
    `overtimeHours` DECIMAL(5, 2) NULL,
    `dayType` ENUM('UTIL', 'FOLGA', 'DOMINGO', 'FERIADO', 'NOTURNO') NOT NULL DEFAULT 'UTIL',
    `additionalRate` DECIMAL(5, 2) NULL,
    `justification` TEXT NULL,
    `status` ENUM('LANCADO', 'PENDENTE_APROVACAO', 'APROVADO', 'REPROVADO', 'ENVIADO_FOLHA') NOT NULL DEFAULT 'LANCADO',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `overtime_entries_tenantId_personId_date_idx`(`tenantId`, `personId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `benefit_catalogs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('VALE_REFEICAO', 'VALE_ALIMENTACAO', 'VALE_TRANSPORTE', 'AUXILIO_COMBUSTIVEL', 'PLANO_SAUDE', 'PLANO_ODONTOLOGICO', 'CONVENIO_FARMACIA', 'CONVENIO_SESC', 'TOTALPASS', 'AUXILIO_EDUCACAO', 'ASSIDUIDADE', 'OUTRO') NOT NULL,
    `eligibilityRule` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `benefit_catalogs_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `benefit_catalogs_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `benefit_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `benefitId` VARCHAR(191) NOT NULL,
    `companyValue` DECIMAL(12, 2) NULL,
    `discountValue` DECIMAL(12, 2) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `status` ENUM('ATIVO', 'INATIVO', 'SUSPENSO', 'PENDENTE', 'CANCELADO') NOT NULL DEFAULT 'ATIVO',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `benefit_assignments_tenantId_personId_idx`(`tenantId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `work_shifts` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `endTime` VARCHAR(5) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `work_shifts_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `work_shifts_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holidays` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `holidays_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `holidays_tenantId_date_key`(`tenantId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_entries` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `shiftId` VARCHAR(191) NULL,
    `date` DATETIME(3) NOT NULL,
    `startTime` VARCHAR(5) NULL,
    `endTime` VARCHAR(5) NULL,
    `dayOff` BOOLEAN NOT NULL DEFAULT false,
    `isHoliday` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PLANEJADA', 'CONFIRMADA', 'ALTERADA', 'CANCELADA', 'REALIZADA') NOT NULL DEFAULT 'PLANEJADA',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `schedule_entries_tenantId_personId_date_idx`(`tenantId`, `personId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trainings` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `workloadHours` DECIMAL(5, 2) NULL,
    `validityMonths` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `trainings_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `training_classes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `trainingId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `shift` VARCHAR(60) NULL,
    `instructor` VARCHAR(120) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `training_classes_tenantId_trainingId_idx`(`tenantId`, `trainingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `training_participants` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `status` ENUM('PLANEJADO', 'CONVOCADO', 'REALIZADO', 'AUSENTE', 'REPROVADO', 'CONCLUIDO', 'VENCIDO') NOT NULL DEFAULT 'PLANEJADO',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `training_participants_tenantId_personId_idx`(`tenantId`, `personId`),
    UNIQUE INDEX `training_participants_classId_personId_key`(`classId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `competencies` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `competencies_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `competencies_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evaluation_cycles` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `evaluation_cycles_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evaluations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `cycleId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `evaluatorUserId` VARCHAR(191) NOT NULL,
    `evaluationDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `averageScore` DECIMAL(4, 2) NULL,
    `notes` TEXT NULL,
    `developmentPlan` TEXT NULL,
    `improvementDeadline` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `evaluations_tenantId_personId_idx`(`tenantId`, `personId`),
    UNIQUE INDEX `evaluations_cycleId_personId_key`(`cycleId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evaluation_scores` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `evaluationId` VARCHAR(191) NOT NULL,
    `competencyId` VARCHAR(191) NOT NULL,
    `score` DECIMAL(4, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `evaluation_scores_tenantId_evaluationId_idx`(`tenantId`, `evaluationId`),
    UNIQUE INDEX `evaluation_scores_evaluationId_competencyId_key`(`evaluationId`, `competencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `handoffs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `fromSector` VARCHAR(40) NOT NULL,
    `toSector` VARCHAR(40) NOT NULL,
    `entityType` ENUM('COMPANY', 'PERSON') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `requestedBy` VARCHAR(191) NOT NULL,
    `assignedTo` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `description` TEXT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `handoffs_tenantId_toSector_status_idx`(`tenantId`, `toSector`, `status`),
    INDEX `handoffs_tenantId_entityType_entityId_idx`(`tenantId`, `entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `handoff_views` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `handoffId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `viewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `handoff_views_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `handoff_views_handoffId_userId_key`(`handoffId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `entityType` VARCHAR(40) NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `audit_logs_tenantId_entityType_entityId_idx`(`tenantId`, `entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(60) NOT NULL,
    `entityType` ENUM('COMPANY', 'PERSON') NULL,
    `entityId` VARCHAR(191) NULL,
    `message` VARCHAR(255) NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_tenantId_userId_read_idx`(`tenantId`, `userId`, `read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `oauth_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` ENUM('GOOGLE', 'MICROSOFT') NOT NULL,
    `accountEmail` VARCHAR(160) NULL,
    `accessToken` TEXT NOT NULL,
    `refreshToken` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `scope` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `oauth_accounts_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `oauth_accounts_userId_provider_key`(`userId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meetings` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `provider` ENUM('GOOGLE', 'MICROSOFT') NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `meetingUrl` VARCHAR(500) NOT NULL,
    `externalEventId` VARCHAR(255) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `pipelineItemId` VARCHAR(191) NULL,
    `sectorCode` VARCHAR(40) NULL,
    `companyId` VARCHAR(191) NULL,
    `clientName` VARCHAR(255) NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `meetings_tenantId_pipelineItemId_idx`(`tenantId`, `pipelineItemId`),
    INDEX `meetings_tenantId_sectorCode_startAt_idx`(`tenantId`, `sectorCode`, `startAt`),
    INDEX `meetings_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meeting_attendees` (
    `meetingId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`meetingId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_tenant_access` ADD CONSTRAINT `user_tenant_access_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_tenant_access` ADD CONSTRAINT `user_tenant_access_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sectors` ADD CONSTRAINT `sectors_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_modules` ADD CONSTRAINT `tenant_modules_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_sectors` ADD CONSTRAINT `user_sectors_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `companies` ADD CONSTRAINT `companies_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `companies` ADD CONSTRAINT `companies_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_services` ADD CONSTRAINT `company_services_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_services` ADD CONSTRAINT `company_services_responsibleUserId_fkey` FOREIGN KEY (`responsibleUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `people` ADD CONSTRAINT `people_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `people` ADD CONSTRAINT `people_currentCompanyId_fkey` FOREIGN KEY (`currentCompanyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `people` ADD CONSTRAINT `people_cargoId_fkey` FOREIGN KEY (`cargoId`) REFERENCES `cargos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `people` ADD CONSTRAINT `people_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipelines` ADD CONSTRAINT `pipelines_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_stages` ADD CONSTRAINT `pipeline_stages_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `pipelines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_items` ADD CONSTRAINT `pipeline_items_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_items` ADD CONSTRAINT `pipeline_items_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `pipelines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_items` ADD CONSTRAINT `pipeline_items_stageId_fkey` FOREIGN KEY (`stageId`) REFERENCES `pipeline_stages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_item_assignees` ADD CONSTRAINT `pipeline_item_assignees_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_item_assignees` ADD CONSTRAINT `pipeline_item_assignees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_item_tags` ADD CONSTRAINT `pipeline_item_tags_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_item_tags` ADD CONSTRAINT `pipeline_item_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_fields` ADD CONSTRAINT `custom_fields_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_values` ADD CONSTRAINT `custom_values_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_values` ADD CONSTRAINT `custom_values_customFieldId_fkey` FOREIGN KEY (`customFieldId`) REFERENCES `custom_fields`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cargos` ADD CONSTRAINT `cargos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cargos` ADD CONSTRAINT `cargos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vagas` ADD CONSTRAINT `vagas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vagas` ADD CONSTRAINT `vagas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vagas` ADD CONSTRAINT `vagas_cargoId_fkey` FOREIGN KEY (`cargoId`) REFERENCES `cargos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidaturas` ADD CONSTRAINT `candidaturas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidaturas` ADD CONSTRAINT `candidaturas_vagaId_fkey` FOREIGN KEY (`vagaId`) REFERENCES `vagas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidaturas` ADD CONSTRAINT `candidaturas_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `candidaturas` ADD CONSTRAINT `candidaturas_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exames_admissionais` ADD CONSTRAINT `exames_admissionais_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exames_admissionais` ADD CONSTRAINT `exames_admissionais_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exames_admissionais` ADD CONSTRAINT `exames_admissionais_candidaturaId_fkey` FOREIGN KEY (`candidaturaId`) REFERENCES `candidaturas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_documents` ADD CONSTRAINT `client_documents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_documents` ADD CONSTRAINT `client_documents_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_documents` ADD CONSTRAINT `client_documents_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_document_recipients` ADD CONSTRAINT `client_document_recipients_clientDocumentId_fkey` FOREIGN KEY (`clientDocumentId`) REFERENCES `client_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_document_views` ADD CONSTRAINT `client_document_views_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `client_document_recipients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_smtp_configs` ADD CONSTRAINT `tenant_smtp_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `field_permissions` ADD CONSTRAINT `field_permissions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_changes` ADD CONSTRAINT `salary_changes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_changes` ADD CONSTRAINT `salary_changes_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salary_changes` ADD CONSTRAINT `salary_changes_cargoId_fkey` FOREIGN KEY (`cargoId`) REFERENCES `cargos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vacations` ADD CONSTRAINT `vacations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vacations` ADD CONSTRAINT `vacations_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absences` ADD CONSTRAINT `absences_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `absences` ADD CONSTRAINT `absences_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `terminations` ADD CONSTRAINT `terminations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `terminations` ADD CONSTRAINT `terminations_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_competencies` ADD CONSTRAINT `payroll_competencies_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_competencies` ADD CONSTRAINT `payroll_competencies_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_entries` ADD CONSTRAINT `payroll_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_entries` ADD CONSTRAINT `payroll_entries_competencyId_fkey` FOREIGN KEY (`competencyId`) REFERENCES `payroll_competencies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_entries` ADD CONSTRAINT `payroll_entries_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `overtime_entries` ADD CONSTRAINT `overtime_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `overtime_entries` ADD CONSTRAINT `overtime_entries_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `benefit_catalogs` ADD CONSTRAINT `benefit_catalogs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `benefit_catalogs` ADD CONSTRAINT `benefit_catalogs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `benefit_assignments` ADD CONSTRAINT `benefit_assignments_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `benefit_assignments` ADD CONSTRAINT `benefit_assignments_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `benefit_assignments` ADD CONSTRAINT `benefit_assignments_benefitId_fkey` FOREIGN KEY (`benefitId`) REFERENCES `benefit_catalogs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_shifts` ADD CONSTRAINT `work_shifts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_shifts` ADD CONSTRAINT `work_shifts_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `holidays` ADD CONSTRAINT `holidays_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_entries` ADD CONSTRAINT `schedule_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_entries` ADD CONSTRAINT `schedule_entries_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_entries` ADD CONSTRAINT `schedule_entries_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `work_shifts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trainings` ADD CONSTRAINT `trainings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_classes` ADD CONSTRAINT `training_classes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_classes` ADD CONSTRAINT `training_classes_trainingId_fkey` FOREIGN KEY (`trainingId`) REFERENCES `trainings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_participants` ADD CONSTRAINT `training_participants_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_participants` ADD CONSTRAINT `training_participants_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `training_classes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_participants` ADD CONSTRAINT `training_participants_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `competencies` ADD CONSTRAINT `competencies_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluation_cycles` ADD CONSTRAINT `evaluation_cycles_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluations` ADD CONSTRAINT `evaluations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluations` ADD CONSTRAINT `evaluations_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `evaluation_cycles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluations` ADD CONSTRAINT `evaluations_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluations` ADD CONSTRAINT `evaluations_evaluatorUserId_fkey` FOREIGN KEY (`evaluatorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluation_scores` ADD CONSTRAINT `evaluation_scores_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluation_scores` ADD CONSTRAINT `evaluation_scores_evaluationId_fkey` FOREIGN KEY (`evaluationId`) REFERENCES `evaluations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evaluation_scores` ADD CONSTRAINT `evaluation_scores_competencyId_fkey` FOREIGN KEY (`competencyId`) REFERENCES `competencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoffs` ADD CONSTRAINT `handoffs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoffs` ADD CONSTRAINT `handoffs_requestedBy_fkey` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoffs` ADD CONSTRAINT `handoffs_assignedTo_fkey` FOREIGN KEY (`assignedTo`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoff_views` ADD CONSTRAINT `handoff_views_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoff_views` ADD CONSTRAINT `handoff_views_handoffId_fkey` FOREIGN KEY (`handoffId`) REFERENCES `handoffs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoff_views` ADD CONSTRAINT `handoff_views_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauth_accounts` ADD CONSTRAINT `oauth_accounts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `oauth_accounts` ADD CONSTRAINT `oauth_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_attendees` ADD CONSTRAINT `meeting_attendees_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `meetings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meeting_attendees` ADD CONSTRAINT `meeting_attendees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

