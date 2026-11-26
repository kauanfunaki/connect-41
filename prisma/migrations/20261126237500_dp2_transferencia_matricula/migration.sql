-- Matrícula na empresa de origem da transferência, para os eventos do eSocial (funcionalidade-771)
ALTER TABLE `dp2_transferencias` ADD COLUMN `matriculaAnterior` VARCHAR(30) NULL;
