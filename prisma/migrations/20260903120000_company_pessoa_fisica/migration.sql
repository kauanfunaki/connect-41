-- Cliente pessoa física em `companies`.
--
-- Decidido em 2026-09-03: PF é uma Company com `kind` e `cpf`, e não entidade
-- própria. O motivo está no comentário do enum `CompanyKind` no schema.
--
-- Puramente aditiva. As 397 empresas existentes viram PESSOA_JURIDICA pelo
-- DEFAULT, que é o que já eram — não há backfill a rodar. O único registro sem
-- CNPJ em produção são duas empresas de teste inativas.
--
-- O índice único de CPF não pode falhar por dado existente: a coluna nasce toda
-- NULL, e NULL não colide com NULL no MySQL.

-- AlterTable
ALTER TABLE `companies` ADD COLUMN `cpf` VARCHAR(14) NULL,
    ADD COLUMN `kind` ENUM('PESSOA_JURIDICA', 'PESSOA_FISICA') NOT NULL DEFAULT 'PESSOA_JURIDICA';

-- CreateIndex
CREATE UNIQUE INDEX `companies_tenantId_cpf_key` ON `companies`(`tenantId`, `cpf`);
