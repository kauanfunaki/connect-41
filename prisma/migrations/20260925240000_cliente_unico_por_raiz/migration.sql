-- Um cliente por raiz de CNPJ em cada escritório (25/09): a mesma raiz em dois clientes
-- é o mesmo cliente cadastrado duas vezes. Conferido antes em produção: 29 clientes,
-- nenhuma raiz repetida. Raiz nula (pessoa física, holding) não colide.
-- CreateIndex
CREATE UNIQUE INDEX `client_groups_tenantId_cnpjRoot_key` ON `client_groups`(`tenantId`, `cnpjRoot`);

