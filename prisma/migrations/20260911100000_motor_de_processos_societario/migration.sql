-- Motor de processos do setor Societário.
--
-- Derivado do fluxograma que o setor montou (docs/fluxos/societario.html), não
-- do protótipo: o protótipo tem a tela, o fluxo tem o que acontece dentro dela.
--
-- Puramente aditiva — 10 tabelas novas, nenhuma coluna existente tocada.
--
-- Três decisões de modelagem que o fluxo forçou, e que seriam caras depois:
--
--   1. `process_protocols.attempt` — o laço "exigência → reapresentação" vira
--      uma linha por apresentação, então o contador de voltas sai de graça. É o
--      que explica um prazo de 7 dias virar trinta.
--   2. `process_template_steps.parallelGroup` — as três licenças do alvará
--      correm juntas e independentes. Numerar como sequência quebra na primeira
--      empresa que precisa de duas.
--   3. `process_steps.actor` + `automationRef` — quem executou: pessoa, robô ou
--      integração. Acrescentar isto depois seria migration em cima de todo o
--      histórico, e histórico que não sabe distinguir os três não mede o que a
--      automação economizou.
--
-- `process_organs` é tabela e não enum pelo mesmo motivo: o fluxo já cita seis
-- órgãos, e eles mudam por município.

-- CreateTable
CREATE TABLE `process_organs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `acronym` VARCHAR(20) NULL,
    `trackingUrl` VARCHAR(500) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_organs_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `process_organs_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_types` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(40) NOT NULL,
    `description` VARCHAR(500) NULL,
    `expectedDaysMin` INTEGER NULL,
    `expectedDaysMax` INTEGER NULL,
    `variableFlow` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_types_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `process_types_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_templates_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `process_templates_typeId_version_key`(`typeId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_template_steps` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(160) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `parallelGroup` VARCHAR(40) NULL,
    `expectedActor` ENUM('PESSOA', 'ROBO', 'INTEGRACAO') NOT NULL DEFAULT 'PESSOA',
    `organId` VARCHAR(191) NULL,
    `optional` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_template_steps_templateId_position_idx`(`templateId`, `position`),
    INDEX `process_template_steps_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_template_checklist_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(200) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_template_checklist_items_stepId_position_idx`(`stepId`, `position`),
    INDEX `process_template_checklist_items_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `processes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `status` ENUM('EM_ANDAMENTO', 'AGUARDANDO_ORGAO', 'EM_EXIGENCIA', 'CONCLUIDO', 'CANCELADO') NOT NULL DEFAULT 'EM_ANDAMENTO',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `concludedAt` DATETIME(3) NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `processes_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `processes_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `processes_tenantId_typeId_startedAt_idx`(`tenantId`, `typeId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_steps` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `processId` VARCHAR(191) NOT NULL,
    `templateStepId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'DISPENSADA') NOT NULL DEFAULT 'PENDENTE',
    `startedAt` DATETIME(3) NULL,
    `doneAt` DATETIME(3) NULL,
    `actor` ENUM('PESSOA', 'ROBO', 'INTEGRACAO') NULL,
    `executedByUserId` VARCHAR(191) NULL,
    `automationRef` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_steps_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `process_steps_processId_templateStepId_key`(`processId`, `templateStepId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_checklist_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NOT NULL,
    `templateItemId` VARCHAR(191) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_checklist_items_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `process_checklist_items_stepId_templateItemId_key`(`stepId`, `templateItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_protocols` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `processId` VARCHAR(191) NOT NULL,
    `stepId` VARCHAR(191) NULL,
    `organId` VARCHAR(191) NOT NULL,
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `number` VARCHAR(80) NULL,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `outcome` ENUM('PENDENTE', 'DEFERIDO', 'EXIGENCIA') NOT NULL DEFAULT 'PENDENTE',
    `resolvedByActor` ENUM('PESSOA', 'ROBO', 'INTEGRACAO') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_protocols_tenantId_outcome_idx`(`tenantId`, `outcome`),
    UNIQUE INDEX `process_protocols_processId_organId_attempt_key`(`processId`, `organId`, `attempt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_requirements` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `protocolId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `raisedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `process_requirements_tenantId_resolvedAt_idx`(`tenantId`, `resolvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `process_organs` ADD CONSTRAINT `process_organs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_types` ADD CONSTRAINT `process_types_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_templates` ADD CONSTRAINT `process_templates_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_templates` ADD CONSTRAINT `process_templates_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `process_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_template_steps` ADD CONSTRAINT `process_template_steps_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_template_steps` ADD CONSTRAINT `process_template_steps_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `process_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_template_steps` ADD CONSTRAINT `process_template_steps_organId_fkey` FOREIGN KEY (`organId`) REFERENCES `process_organs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_template_checklist_items` ADD CONSTRAINT `process_template_checklist_items_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_template_checklist_items` ADD CONSTRAINT `process_template_checklist_items_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `process_template_steps`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processes` ADD CONSTRAINT `processes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processes` ADD CONSTRAINT `processes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processes` ADD CONSTRAINT `processes_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `process_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processes` ADD CONSTRAINT `processes_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `process_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `processes` ADD CONSTRAINT `processes_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_steps` ADD CONSTRAINT `process_steps_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_steps` ADD CONSTRAINT `process_steps_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_steps` ADD CONSTRAINT `process_steps_templateStepId_fkey` FOREIGN KEY (`templateStepId`) REFERENCES `process_template_steps`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_steps` ADD CONSTRAINT `process_steps_executedByUserId_fkey` FOREIGN KEY (`executedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_checklist_items` ADD CONSTRAINT `process_checklist_items_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_checklist_items` ADD CONSTRAINT `process_checklist_items_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `process_steps`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_checklist_items` ADD CONSTRAINT `process_checklist_items_templateItemId_fkey` FOREIGN KEY (`templateItemId`) REFERENCES `process_template_checklist_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_protocols` ADD CONSTRAINT `process_protocols_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_protocols` ADD CONSTRAINT `process_protocols_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_protocols` ADD CONSTRAINT `process_protocols_stepId_fkey` FOREIGN KEY (`stepId`) REFERENCES `process_steps`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_protocols` ADD CONSTRAINT `process_protocols_organId_fkey` FOREIGN KEY (`organId`) REFERENCES `process_organs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_requirements` ADD CONSTRAINT `process_requirements_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_requirements` ADD CONSTRAINT `process_requirements_protocolId_fkey` FOREIGN KEY (`protocolId`) REFERENCES `process_protocols`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

