-- Integra Contador, Fase 0 (20/10/2026): o ambiente de cada chamada (produção
-- ou demonstração, o trial do Serpro, que fica fora do teto e do custo) e o
-- X-Request-Tag enviado, que liga a linha ao relatório de consumo da Área do
-- Cliente do Serpro. As linhas que já existem são de produção.
-- A tela de consumo e o registro das chamadas leem as colunas: rodar ANTES do deploy.

-- AlterTable
ALTER TABLE `serpro_calls` ADD COLUMN `ambiente` VARCHAR(12) NOT NULL DEFAULT 'PRODUCAO',
    ADD COLUMN `requestTag` VARCHAR(32) NULL;
