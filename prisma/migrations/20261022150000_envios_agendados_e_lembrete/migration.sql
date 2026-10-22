-- Envios agendados e lembrete de não lido (22/10/2026). Tudo nulo é o envio
-- de sempre: sem data marcada e sem lembrete — as linhas que já existem não
-- mudam. Ver src/lib/envios/agendador.ts.
--
-- `scheduledFor`: o rascunho sai sozinho nesta data (o agendador interno
-- publica e manda os e-mails de `scheduledEmails`, uma lista JSON).
-- `reminderDays`/`reminderSentAt`: se ninguém do cliente abriu em N dias,
-- sai um lembrete só; a data gravada é a trava contra o envio em dobro.
ALTER TABLE `client_documents`
    ADD COLUMN `scheduledFor` DATETIME(3) NULL,
    ADD COLUMN `scheduledEmails` JSON NULL,
    ADD COLUMN `reminderDays` INTEGER NULL,
    ADD COLUMN `reminderSentAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `client_documents_status_scheduledFor_idx` ON `client_documents`(`status`, `scheduledFor`);

-- CreateIndex
CREATE INDEX `client_documents_status_reminderSentAt_idx` ON `client_documents`(`status`, `reminderSentAt`);
