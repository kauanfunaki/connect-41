-- A conta do tipo adiantamento (lote D, 20/10): a fornecedores e de clientes.
-- Só valores novos no enum; as contas que existem continuam como estão.
-- AlterTable
ALTER TABLE `bank_accounts` MODIFY `type` ENUM('CORRENTE', 'POUPANCA', 'ADIANTAMENTO_FORNECEDOR', 'ADIANTAMENTO_CLIENTE') NOT NULL DEFAULT 'CORRENTE';

