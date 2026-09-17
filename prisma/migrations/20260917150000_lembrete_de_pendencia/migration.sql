-- Lembrete automático de pendência vencida: um registro por (pendência, passo),
-- gravado antes do e-mail para o unique decidir entre execuções simultâneas.
-- Aditiva: só cria a tabela. Nenhuma tabela existente muda, então pode rodar
-- antes do deploy.

-- CreateTable
CREATE TABLE `client_request_reminders` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `step` INTEGER NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `failures` INTEGER NOT NULL DEFAULT 0,
    `ok` BOOLEAN NOT NULL DEFAULT false,
    `error` VARCHAR(500) NULL,

    INDEX `client_request_reminders_tenantId_sentAt_idx`(`tenantId`, `sentAt`),
    UNIQUE INDEX `client_request_reminders_requestId_step_key`(`requestId`, `step`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `client_request_reminders` ADD CONSTRAINT `client_request_reminders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_reminders` ADD CONSTRAINT `client_request_reminders_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `client_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
