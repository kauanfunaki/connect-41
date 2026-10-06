-- Fotos diárias dos números da Home (06/10/2026): o histórico do selo
-- "▲ 12% em 7 dias" e da linha das últimas semanas nos painéis (opção A).
--
-- Só uma tabela nova, sem FK e sem coluna em tabela existente. A Home lê e
-- grava com tolerância a falha: sem a tabela, os painéis aparecem sem selo e
-- sem linha (e o erro fica no log). Mesmo assim, rodar antes da publicação —
-- o histórico só começa a contar a partir da primeira Home aberta com ela.
--
-- A chave primária é a única chave: a leitura da Home é por (tenant, escopo,
-- métricas, janela de dias) e a gravação é um upsert pela chave inteira.

-- CreateTable
CREATE TABLE `home_metric_snapshots` (
    `tenantId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(100) NOT NULL DEFAULT '',
    `metric` VARCHAR(40) NOT NULL,
    `day` DATE NOT NULL,
    `value` BIGINT NOT NULL,

    PRIMARY KEY (`tenantId`, `scope`, `metric`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
