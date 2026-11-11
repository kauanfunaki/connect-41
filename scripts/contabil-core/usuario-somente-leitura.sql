-- Usuário SOMENTE LEITURA para a carga do Contábil Core no Connect (Fase 5, 10/11/2026).
--
-- Roda no PostgreSQL do Contábil Core, com um usuário que possa criar papéis. Troque o nome do
-- banco e escolha uma senha forte no lugar de TROQUE_ESTA_SENHA. NÃO commite o arquivo com a
-- senha preenchida. A carga recebe a conexão pela variável CARGA_ORIGEM_URL.
--
-- O papel só lê as tabelas do esquema `public` (e as que forem criadas depois, pelo dono atual).
-- A carga ainda abre a transação como READ ONLY, então mesmo um papel com mais direitos não grava.

CREATE ROLE contabil_carga_leitura LOGIN PASSWORD 'TROQUE_ESTA_SENHA'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE contabil_db TO contabil_carga_leitura;
GRANT USAGE ON SCHEMA public TO contabil_carga_leitura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO contabil_carga_leitura;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO contabil_carga_leitura;

-- Depois da virada (ou para tirar o acesso):
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM contabil_carga_leitura;
--   DROP ROLE contabil_carga_leitura;
