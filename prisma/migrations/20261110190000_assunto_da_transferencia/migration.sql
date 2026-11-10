-- Transferências (10/11/2026, pedido do Kauan): o assunto e o modelo usado.
-- O modelo escolhido ("Baixa de CNPJ") se perdia ao enviar; agora vira o
-- assunto, o título da transferência na lista e no detalhe. `templateKey`
-- guarda qual modelo foi, para a nova transferência mostrar os mais usados.
-- As duas colunas entram vazias e assim ficam nas transferências de antes,
-- que aparecem como "Sem assunto": não há preenchimento retroativo.
-- AlterTable
ALTER TABLE `handoffs` ADD COLUMN `subject` VARCHAR(160) NULL,
    ADD COLUMN `templateKey` VARCHAR(60) NULL;
