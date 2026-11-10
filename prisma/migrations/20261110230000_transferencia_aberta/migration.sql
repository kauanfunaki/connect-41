-- Transferências (10/11/2026, pedido do Kauan): a transferência aberta com o
-- andamento no topo e a conversa ao lado (Controle interno melhoria-591).
--
-- 1. "Devolvida" é uma situação nova da parte do setor: o setor de destino
--    devolve a parte dele a quem pediu, com o motivo, e quem pediu responde e
--    reenvia (a parte volta a "Nova"). O valor entra no FIM do enum, então o
--    MySQL só acrescenta um valor à coluna; nenhuma linha muda.
-- 2. `handoff_events` guarda a "Atividade": o pedido, cada começo, finalização,
--    devolução e reenvio, os comentários e as mudanças de responsáveis e de
--    dados. Tabela nova e vazia: as transferências de antes não ganham eventos
--    (a tela deduz "pediu" e "finalizou" das datas que já existem).
--
-- Só acrescenta: nada é apagado nem renomeado.

-- AlterTable
ALTER TABLE `handoff_sectors` MODIFY `status` ENUM('NEW', 'IN_PROGRESS', 'DONE', 'RETURNED') NOT NULL DEFAULT 'NEW';

-- CreateTable
CREATE TABLE `handoff_events` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `handoffId` VARCHAR(191) NOT NULL,
    `handoffSectorId` VARCHAR(191) NULL,
    `type` ENUM('CREATED', 'STARTED', 'DONE', 'RETURNED', 'RESENT', 'COMMENT', 'ASSIGNEES_CHANGED', 'EDITED', 'REOPENED') NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `body` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `handoff_events_tenantId_handoffId_createdAt_idx`(`tenantId`, `handoffId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `handoff_events` ADD CONSTRAINT `handoff_events_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoff_events` ADD CONSTRAINT `handoff_events_handoffId_fkey` FOREIGN KEY (`handoffId`) REFERENCES `handoffs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoff_events` ADD CONSTRAINT `handoff_events_handoffSectorId_fkey` FOREIGN KEY (`handoffSectorId`) REFERENCES `handoff_sectors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoff_events` ADD CONSTRAINT `handoff_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
