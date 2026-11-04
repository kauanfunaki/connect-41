-- GitHub (04/11/2026): times montados pelo coordenador do Tech e a cor de cada
-- pessoa, pelo ID estável do GitHub. Tabelas novas; não altera registros existentes.
-- CreateTable
CREATE TABLE `github_teams` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `color` VARCHAR(7) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `github_teams_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_people` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(100) NOT NULL,
    `login` VARCHAR(100) NOT NULL,
    `color` VARCHAR(7) NULL,
    `teamId` VARCHAR(191) NULL,

    INDEX `github_people_tenantId_teamId_idx`(`tenantId`, `teamId`),
    UNIQUE INDEX `github_people_tenantId_externalId_key`(`tenantId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `github_people` ADD CONSTRAINT `github_people_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `github_teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
