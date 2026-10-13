-- O tutorial do primeiro acesso (13/10/2026): quem já viu, ou pulou, o da equipe e
-- o do portal do cliente — e em qual versão do conteúdo.
-- Só cria a tabela nova `tutoriais_vistos`; nenhuma tabela existente muda.
-- Sem chave estrangeira, de propósito: é marca de leitura (ver o model
-- `TutorialVisto` no schema). `userId` é de `users` ou de `portal_users`,
-- conforme `subject`.
-- Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código subir antes, as
-- telas não quebram: sem a tabela, o tutorial só não abre.
-- CreateTable
CREATE TABLE `tutoriais_vistos` (
    `subject` ENUM('USER', 'PORTAL_USER') NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tutorial` VARCHAR(40) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `completedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tutoriais_vistos_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`subject`, `userId`, `tutorial`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
