-- A solicitação do cliente vira cartão no quadro do setor (09/11/2026).
--
-- `service_request_subjects.cardPipelineId`: a lista em que a solicitação do
-- assunto vira cartão. Nula (o padrão) = não vira; apagar a lista desliga.
-- `pipeline_items.serviceRequestId`: a solicitação que o cartão acompanha. O
-- índice único é o que garante um cartão por solicitação.
--
-- Só colunas novas, nulas. Rodar ANTES do deploy: o código novo lê as duas
-- colunas no quadro e na solicitação, e sem elas a página cai.

-- AlterTable
ALTER TABLE `pipeline_items` ADD COLUMN `serviceRequestId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `service_request_subjects` ADD COLUMN `cardPipelineId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `pipeline_items_serviceRequestId_key` ON `pipeline_items`(`serviceRequestId`);

-- AddForeignKey
ALTER TABLE `pipeline_items` ADD CONSTRAINT `pipeline_items_serviceRequestId_fkey` FOREIGN KEY (`serviceRequestId`) REFERENCES `service_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request_subjects` ADD CONSTRAINT `service_request_subjects_cardPipelineId_fkey` FOREIGN KEY (`cardPipelineId`) REFERENCES `pipelines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
