-- A branch que a coleta de commits lê no repositório (12/11/2026). NULL = a branch padrão do GitHub.
ALTER TABLE `github_repositories` ADD COLUMN `branch` VARCHAR(255) NULL;
