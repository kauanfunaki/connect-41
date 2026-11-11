# Academia — API do ranking (10/11/2026)

O ranking do mês da Academia para o post do Slack (fluxo do n8n). Só leitura.

## Autenticação

Token pessoal no cabeçalho, como o resto da `/api/v1`:

```
Authorization: Bearer c41_…
```

Crie o token em **Configurações › Sua conta › Tokens de acesso**, opção **Ranking da Academia** (escopo `academia:ler`). O token só funciona com a Academia ligada no escritório; vale o escritório da pessoa dona do token.

## `GET /api/v1/academia/ranking`

| Parâmetro | Obrigatório | Valores |
| --- | --- | --- |
| `teste` | sim | `digitacao`, `numeros`, `logica` ou `atalhos` (desde 11/11/2026) |
| `mes` | não | `AAAA-MM` (padrão: o mês de hoje, em São Paulo) |
| `nivel` | não | `facil`, `medio` ou `dificil` (sem ele: todos os níveis) |
| `limite` | não | 1 a 50 (padrão 10) |

Exemplo — o post do dia 1º, com o mês que acabou:

```
GET /api/v1/academia/ranking?teste=digitacao&mes=2026-10
```

```json
{
  "teste": "digitacao",
  "testeRotulo": "Digitação",
  "mes": "2026-10",
  "mesRotulo": "outubro de 2026",
  "nivel": null,
  "mesEncerrado": true,
  "premio": "Top 3 ganham chocolate",
  "participantes": 14,
  "certificado": { "disponivel": true, "colocacoes": 3 },
  "ranking": [
    {
      "posicao": 1,
      "nome": "Pessoa Exemplo",
      "setor": "Fiscal",
      "nivel": "dificil",
      "nivelRotulo": "Difícil",
      "ppm": 71,
      "acertos": null,
      "total": null,
      "precisao": 97.4,
      "pontos": 71,
      "certificado": true
    }
  ],
  "url": "https://app.exemplo.com.br/academia/ranking?mes=2026-10&teste=digitacao"
}
```

- Só entra quem deixou **Aparecer no ranking** ligado. Quem desligou não sai na API nem no post.
- Digitação e números trazem `ppm`; lógica traz `acertos` e `total` (em todos os níveis, somados).
- `pontos` é o número que ordena: PPM líquido (num nível), média do PPM ponderada pelo nível (todos os níveis), precisão (lógica num nível) ou a soma ponderada da precisão (lógica, todos os níveis). Mesma régua do 41 Hub.
- `certificado` em cada linha: o pódio (1º a 3º) do ranking geral (sem `nivel`) de um mês encerrado. A pessoa baixa o PDF na tela do ranking.

## Erros

`{ "error": { "code", "message" } }`, como a `/api/v1` do Controle interno: `401` sem token ou token inválido/vencido/revogado, `403 insufficient_scope` sem o escopo `academia:ler`, `403 module_disabled` com a Academia desligada, `422 validation_error` com parâmetro inválido.

## Importação do histórico do Hub

Uma vez só, rodada pelo Kauan: `scripts/academia/exportar-do-hub.sql` (no banco do Hub) e `scripts/academia/importar-do-hub.ts` (prévia por padrão; `--aplicar` grava). Detalhes no topo do script.
