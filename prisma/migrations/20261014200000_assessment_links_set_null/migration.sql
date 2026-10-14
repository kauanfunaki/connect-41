-- Link de teste não trava mais a exclusão (14/10/2026).
--
-- Em 24/07/2026 as migrations criaram as chaves de `assessment_links` para a
-- candidatura e para o modelo de teste com ON DELETE RESTRICT, enquanto o
-- schema (relações opcionais, sem `onDelete`) diz SET NULL. A exclusão de
-- candidato e de empresa confia no schema: apagar a candidatura de quem tinha
-- um teste ligado a ela esbarrava no banco ("o banco recusou a exclusão").
--
-- Aqui as duas chaves passam a SET NULL, como o schema: a candidatura ou o
-- modelo saem e o teste fica, sem o vínculo (a tela do teste já mostra
-- "Modelo excluído"). As duas colunas já aceitam NULL desde a criação.
--
-- Nenhuma linha muda: só troca a regra das duas chaves.
--
-- RODAR COM `migrate deploy` ANTES DO DEPLOY. Se o código subir antes, nada
-- quebra: os serviços de exclusão soltam o teste da candidatura antes de
-- apagá-la, com ou sem esta migration.

-- DropForeignKey
ALTER TABLE `assessment_links` DROP FOREIGN KEY `assessment_links_candidaturaId_fkey`;

-- DropForeignKey
ALTER TABLE `assessment_links` DROP FOREIGN KEY `assessment_links_templateId_fkey`;

-- AddForeignKey
ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_candidaturaId_fkey` FOREIGN KEY (`candidaturaId`) REFERENCES `candidaturas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `assessment_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
