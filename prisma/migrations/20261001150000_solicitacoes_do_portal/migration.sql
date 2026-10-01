-- Solicitações do cliente pelo portal (01/10/2026).
--
-- Só tabelas novas: nenhuma coluna entra em tabela que o app já lê. Ainda
-- assim, rodar antes da publicação — a home do portal e a fila interna
-- consultam service_requests, e a tabela ausente derruba as duas.
--
-- Os assuntos padrão não são semeados aqui: o app cria na primeira vez que
-- alguém abre a tela de assuntos ou a nova solicitação, conferindo quais
-- setores existem no tenant (ver garantirAssuntosPadrao).

-- CreateTable
CREATE TABLE `service_request_subjects` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `responseDays` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_request_subjects_tenantId_active_order_idx`(`tenantId`, `active`, `order`),
    UNIQUE INDEX `service_request_subjects_tenantId_label_key`(`tenantId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_requests` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `subjectId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `description` TEXT NOT NULL,
    `status` ENUM('ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
    `responseDue` DATETIME(3) NOT NULL,
    `firstResponseAt` DATETIME(3) NULL,
    `assigneeId` VARCHAR(191) NULL,
    `openedByPortalUserId` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `closedById` VARCHAR(191) NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_requests_tenantId_status_sectorCode_idx`(`tenantId`, `status`, `sectorCode`),
    INDEX `service_requests_tenantId_companyId_status_idx`(`tenantId`, `companyId`, `status`),
    INDEX `service_requests_tenantId_assigneeId_status_idx`(`tenantId`, `assigneeId`, `status`),
    UNIQUE INDEX `service_requests_tenantId_number_key`(`tenantId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_request_messages` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `authorUserId` VARCHAR(191) NULL,
    `authorPortalUserId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `internal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_request_messages_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_request_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NULL,
    `uploadedByUserId` VARCHAR(191) NULL,
    `uploadedByPortalUserId` VARCHAR(191) NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `service_request_attachments_requestId_idx`(`requestId`),
    INDEX `service_request_attachments_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `service_request_subjects` ADD CONSTRAINT `service_request_subjects_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `service_request_subjects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_openedByPortalUserId_fkey` FOREIGN KEY (`openedByPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_requests` ADD CONSTRAINT `service_requests_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_messages` ADD CONSTRAINT `service_request_messages_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `service_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_messages` ADD CONSTRAINT `service_request_messages_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_messages` ADD CONSTRAINT `service_request_messages_authorPortalUserId_fkey` FOREIGN KEY (`authorPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_attachments` ADD CONSTRAINT `service_request_attachments_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `service_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_attachments` ADD CONSTRAINT `service_request_attachments_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `service_request_messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_attachments` ADD CONSTRAINT `service_request_attachments_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_attachments` ADD CONSTRAINT `service_request_attachments_uploadedByPortalUserId_fkey` FOREIGN KEY (`uploadedByPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

