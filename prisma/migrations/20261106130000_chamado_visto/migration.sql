-- Chamados (06/11/2026): quando cada pessoa abriu o chamado pela última vez,
-- para o número do menu. Tabela nova; não altera registros existentes.
-- CreateTable
CREATE TABLE `helpdesk_ticket_views` (
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `viewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `helpdesk_ticket_views_tenantId_userId_idx`(`tenantId`, `userId`),
    PRIMARY KEY (`tenantId`, `ticketId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `helpdesk_ticket_views` ADD CONSTRAINT `helpdesk_ticket_views_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
