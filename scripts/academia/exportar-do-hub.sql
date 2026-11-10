-- Exporta do 41 Hub (Postgres) o que a Academia do Connect importa
-- (10/11/2026, pedido do Kauan). Uma vez só: o Hub segue no ar como está.
--
-- Rode no psql conectado ao banco do Hub, de dentro de uma pasta vazia:
--
--   psql "<url do banco do Hub>" -f exportar-do-hub.sql
--
-- Gera cinco arquivos CSV na pasta atual. Depois:
--
--   npx tsx --env-file=.env scripts/academia/importar-do-hub.ts --pasta=<a pasta>            (prévia)
--   npx tsx --env-file=.env scripts/academia/importar-do-hub.ts --pasta=<a pasta> --aplicar  (grava)
--
-- Os CSVs têm e-mail de gente: guarde fora do repositório e apague depois.
-- O `users.csv` sai só com o id e o e-mail de quem tem resultado.

\copy (SELECT id, language, content, difficulty, is_active, created_at FROM typing_texts ORDER BY created_at) TO 'typing_texts.csv' WITH (FORMAT csv, HEADER true)

\copy (SELECT id, language, question, image_url, options, correct_index, difficulty, is_active, created_at FROM logic_questions ORDER BY created_at) TO 'logic_questions.csv' WITH (FORMAT csv, HEADER true)

\copy (SELECT id, user_id, month_key, wpm, accuracy, duration_ms, difficulty, level, created_at FROM typing_scores ORDER BY created_at) TO 'typing_scores.csv' WITH (FORMAT csv, HEADER true)

\copy (SELECT id, user_id, month_key, correct_count, total_questions, accuracy, duration_ms, difficulty, level, created_at FROM logic_scores ORDER BY created_at) TO 'logic_scores.csv' WITH (FORMAT csv, HEADER true)

\copy (SELECT u.id, u.email FROM users u WHERE u.id IN (SELECT user_id FROM typing_scores UNION SELECT user_id FROM logic_scores)) TO 'users.csv' WITH (FORMAT csv, HEADER true)
