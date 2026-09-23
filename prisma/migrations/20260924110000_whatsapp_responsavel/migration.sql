-- Quem assumiu a conversa transferida do WhatsApp do Recrutamento.
--
-- Aditiva: duas colunas opcionais em `whatsapp_threads`, índice e chave
-- estrangeira para `users` (usuário removido solta a conversa).

-- AlterTable
ALTER TABLE `whatsapp_threads` ADD COLUMN `assignedAt` DATETIME(3) NULL,
    ADD COLUMN `assignedToId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `whatsapp_threads_assignedToId_idx` ON `whatsapp_threads`(`assignedToId`);

-- AddForeignKey
ALTER TABLE `whatsapp_threads` ADD CONSTRAINT `whatsapp_threads_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
