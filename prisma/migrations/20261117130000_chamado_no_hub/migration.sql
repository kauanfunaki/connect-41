-- Chamados: a cópia no Hub, só de ida (17/11/2026, funcionalidade-711).
-- Só acrescenta colunas com padrão; os chamados de antes ficam como estão e não vão ao Hub.

-- AlterTable
ALTER TABLE `helpdesk_tickets` ADD COLUMN `hubAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `hubLastError` VARCHAR(300) NULL,
    ADD COLUMN `hubPending` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hubSentAt` DATETIME(3) NULL,
    ADD COLUMN `hubTicketId` VARCHAR(64) NULL,
    ADD COLUMN `hubTicketUrl` VARCHAR(500) NULL;

-- CreateIndex
CREATE INDEX `helpdesk_tickets_tenantId_hubPending_idx` ON `helpdesk_tickets`(`tenantId`, `hubPending`);

