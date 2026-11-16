-- Encaminhar o chamado para outro setor continuar (16/11/2026, funcionalidade-709):
-- o setor que encaminhou passa a acompanhar o chamado. Tabela nova, sem mexer
-- nos chamados que já existem.
-- CreateTable
CREATE TABLE `helpdesk_ticket_sectors` (
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `helpdesk_ticket_sectors_tenantId_sectorCode_idx`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`tenantId`, `ticketId`, `sectorCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `helpdesk_ticket_sectors` ADD CONSTRAINT `helpdesk_ticket_sectors_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

