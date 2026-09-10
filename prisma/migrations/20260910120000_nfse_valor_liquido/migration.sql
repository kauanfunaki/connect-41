-- Líquido da NFS-e: o que a conta a pagar usa quando há retenção.
--
-- Regra confirmada pelo BPO (Amanda, 10/09/2026): com retenção paga-se pelo
-- líquido; sem retenção nem desconto os dois números são iguais e tanto faz.
--
-- Aditiva, duas colunas nuláveis. `amount` continua sendo o bruto impresso no
-- DANFSE e não é tocado — o acervo espelha a nota, e quem subtrai é o
-- lançamento. NULL aqui significa "esta nota não tem o que subtrair", e é
-- exatamente o que todo documento já importado é: nenhum deles foi lido com o
-- parser novo.
ALTER TABLE `fiscal_documents`
  ADD COLUMN `netAmount` DECIMAL(12, 2) NULL,
  ADD COLUMN `retentionsTotal` DECIMAL(12, 2) NULL;
