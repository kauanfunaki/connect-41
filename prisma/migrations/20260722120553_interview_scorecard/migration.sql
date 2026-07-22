-- CreateTable
CREATE TABLE `interview_scorecards` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `candidaturaId` VARCHAR(191) NOT NULL,
    `evaluatorUserId` VARCHAR(191) NOT NULL,
    `stage` ENUM('TRIAGEM', 'ENTREVISTA', 'TESTE', 'PROPOSTA', 'CONTRATADO') NULL,
    `comunicacao` INTEGER NULL,
    `tecnico` INTEGER NULL,
    `fitCultural` INTEGER NULL,
    `experiencia` INTEGER NULL,
    `recommendation` ENUM('AVANCAR', 'TALVEZ', 'REPROVAR') NOT NULL DEFAULT 'TALVEZ',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `interview_scorecards_tenantId_candidaturaId_idx`(`tenantId`, `candidaturaId`),
    UNIQUE INDEX `interview_scorecards_candidaturaId_evaluatorUserId_key`(`candidaturaId`, `evaluatorUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `interview_scorecards` ADD CONSTRAINT `interview_scorecards_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview_scorecards` ADD CONSTRAINT `interview_scorecards_candidaturaId_fkey` FOREIGN KEY (`candidaturaId`) REFERENCES `candidaturas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `interview_scorecards` ADD CONSTRAINT `interview_scorecards_evaluatorUserId_fkey` FOREIGN KEY (`evaluatorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
