-- O parcelamento e o "mudar a série daqui em diante" (22/10/2026). As parcelas
-- reaproveitam a série da repetição (`recurrenceId`, "3/12") e a regra dela —
-- não há tabela nova. A única coluna nova é o dia do vencimento que mudou
-- depois do lançamento (o aluguel que passou do dia 10 para o 15), para as
-- contas que o agendador ainda vai criar nascerem no dia novo. Nula em toda
-- série existente: o dia continua sendo o do primeiro vencimento.
-- AlterTable
ALTER TABLE `finance_recurrences` ADD COLUMN `dueDay` INTEGER NULL;
