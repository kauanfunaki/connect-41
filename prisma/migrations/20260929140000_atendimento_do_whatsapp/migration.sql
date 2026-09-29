-- AlterTable
ALTER TABLE `whatsapp_messages` ADD COLUMN `automatica` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `whatsapp_atendimentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `abertoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `encerradoEm` DATETIME(3) NULL,
    `encerradoPorId` VARCHAR(191) NULL,
    `desfecho` VARCHAR(40) NULL,

    INDEX `whatsapp_atendimentos_threadId_abertoEm_idx`(`threadId`, `abertoEm`),
    INDEX `whatsapp_atendimentos_tenantId_encerradoEm_idx`(`tenantId`, `encerradoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `whatsapp_atendimentos` ADD CONSTRAINT `whatsapp_atendimentos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_atendimentos` ADD CONSTRAINT `whatsapp_atendimentos_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `whatsapp_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_atendimentos` ADD CONSTRAINT `whatsapp_atendimentos_encerradoPorId_fkey` FOREIGN KEY (`encerradoPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Toda conversa que já existe ganha o atendimento em que ela está: aberto
-- desde o começo da conversa, para o assistente não se apresentar de novo nem
-- perder o histórico no meio de uma conversa em andamento. Quem pediu para
-- parar fica com o atendimento encerrado pelo próprio candidato.
INSERT INTO `whatsapp_atendimentos` (`id`, `tenantId`, `threadId`, `abertoEm`, `encerradoEm`, `desfecho`)
SELECT UUID(), `tenantId`, `id`, `createdAt`, `optedOutAt`,
       CASE WHEN `optedOutAt` IS NULL THEN NULL ELSE 'PEDIU_PARA_PARAR' END
FROM `whatsapp_threads`;
