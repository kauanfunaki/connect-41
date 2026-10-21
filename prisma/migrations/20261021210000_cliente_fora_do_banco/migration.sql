-- Saída do Cliente, etapa 4 (21/10/2026), a última: o que sobrou do Cliente no
-- banco sai de vez. Irreversível — e por isso só depois de a etapa 3
-- (20261021180000_cliente_sem_chaves) estar estável na produção: o código da
-- etapa 2 ainda lia estas colunas, e sem elas não há mais volta para ele.
--
-- Desde a etapa 3 nada lê nem grava estas tabelas e colunas, e nenhuma chave
-- estrangeira liga uma delas ao resto: as tabelas caem sem cascata e as
-- colunas, sem levar dado de ninguém. O que se perde é só o histórico de qual
-- empresa era de qual Cliente, que o Connect deixou de usar em 14/10.
--
-- Os índices com `clientGroupId` saem antes das colunas, explícitos: sem isso,
-- o MySQL encolheria cada um para só `tenantId`, um índice que ninguém pediu.

-- DropIndex
ALTER TABLE `companies` DROP INDEX `companies_tenantId_clientGroupId_idx`;

-- AlterTable
ALTER TABLE `companies` DROP COLUMN `clientGroupId`;

-- DropIndex
ALTER TABLE `portal_users` DROP INDEX `portal_users_tenantId_clientGroupId_idx`;

-- AlterTable
ALTER TABLE `portal_users` DROP COLUMN `clientGroupId`;

-- DropTable
DROP TABLE `client_announcement_groups`;

-- DropTable
DROP TABLE `client_groups`;
