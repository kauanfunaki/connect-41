-- Controle interno (11/11/2026, funcionalidade-579): o "Antes de testar" do
-- critério de aceite vira lista para marcar, como o "Aprovado quando", e o
-- "Conferir" do PR guarda o que conferiu sozinho (PR mergeado, migration
-- aplicada, no ar). As marcas das seções ficam na mesma tabela, separadas pela
-- coluna `section`. As marcas que já existem são do "Aprovado quando" e ficam
-- com o padrão "aprovado". Não altera nenhum outro registro.
-- O índice novo entra antes de o antigo sair: a chave estrangeira de
-- (tenantId, itemId) usa o índice que começa por essas colunas.
-- AlterTable
ALTER TABLE `tech_internal_acceptance_checks` ADD COLUMN `section` VARCHAR(10) NOT NULL DEFAULT 'aprovado';

-- CreateIndex
CREATE UNIQUE INDEX `tech_internal_acceptance_checks_tenantId_itemId_section_posi_key` ON `tech_internal_acceptance_checks`(`tenantId`, `itemId`, `section`, `position`);

-- DropIndex
DROP INDEX `tech_internal_acceptance_checks_tenantId_itemId_position_key` ON `tech_internal_acceptance_checks`;
