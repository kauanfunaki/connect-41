-- Avaliar a resposta do chat de IA (02/10/2026): 👍/👎 e o motivo do 👎.
--
-- Só colunas novas, todas opcionais. Rodar ANTES da publicação: a tela do
-- chat lê `agent_messages` inteira, e sem as colunas o chat cai (o resto do
-- Connect segue de pé).

-- AlterTable
ALTER TABLE `agent_messages` ADD COLUMN `ratedAt` DATETIME(3) NULL,
    ADD COLUMN `rating` ENUM('BOA', 'RUIM') NULL,
    ADD COLUMN `ratingReason` VARCHAR(40) NULL;

-- CreateIndex
CREATE INDEX `agent_messages_ratedAt_idx` ON `agent_messages`(`ratedAt`);
