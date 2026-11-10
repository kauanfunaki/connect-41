-- Senha pessoal e "todos do setor, menos…" no Repositório de senhas
-- (10/11/2026, pedido do Kauan).
--
-- 1. `bpo_credentials.visibility`: SETOR (o de sempre — todo o setor da
--    credencial) ou PESSOAL (só quem cadastrou vê, revela e edita; o
--    Administrador e o Super Admin veem só que ela existe e podem excluí-la).
--    As credenciais que já existem ficam SETOR pelo padrão: nada muda nelas.
-- 2. `bpo_credential_restrictions`: as pessoas do setor que NÃO veem uma
--    credencial do setor, marcadas pela coordenação. Sai junto com a
--    credencial e com a pessoa (CASCADE).
--
-- Só acrescenta: coluna nova com padrão e tabela nova. Nenhuma linha é
-- apagada nem muda de dono. Rodar antes do deploy: a tela lê a coluna nova.

-- AlterTable
ALTER TABLE `bpo_credentials` ADD COLUMN `visibility` ENUM('SETOR', 'PESSOAL') NOT NULL DEFAULT 'SETOR';

-- CreateTable
CREATE TABLE `bpo_credential_restrictions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bpo_credential_restrictions_tenantId_userId_idx`(`tenantId`, `userId`),
    UNIQUE INDEX `bpo_credential_restrictions_credentialId_userId_key`(`credentialId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bpo_credential_restrictions` ADD CONSTRAINT `bpo_credential_restrictions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bpo_credential_restrictions` ADD CONSTRAINT `bpo_credential_restrictions_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `bpo_credentials`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bpo_credential_restrictions` ADD CONSTRAINT `bpo_credential_restrictions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
