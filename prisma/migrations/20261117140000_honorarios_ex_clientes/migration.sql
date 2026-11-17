-- Ex-clientes fora da auditoria de contratos (17/11/2026): a mesma regra do
-- Aditiva Pronto (ADR-012), que não tinha vindo na migração para o Connect.
-- 1. hon_config.pastaExClientes: pasta dos ex-clientes, direto na raiz da rede.
--    O robô (1.2+) recebe esse nome na configuração e lista as pastas de dentro.
--    Nulo = não lista.
-- 2. hon_sync_jobs.exClientes: nomes recebidos no fim da varredura. Nulo = robô
--    sem a lista; as telas usam a última lista recebida.
-- Só acrescenta colunas que aceitam nulo: não mexe em nada que já existe.

-- AlterTable
ALTER TABLE `hon_config` ADD COLUMN `pastaExClientes` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `hon_sync_jobs` ADD COLUMN `exClientes` JSON NULL;

-- O nome da pasta na rede do escritório, o mesmo padrão do Aditiva. Só nos
-- escritórios que já têm a rede configurada; dá para trocar depois.
UPDATE `hon_config` SET `pastaExClientes` = '009_EMPRESAS EX CLIENTES'
 WHERE `pastaExClientes` IS NULL AND `raizUnc` <> '';
