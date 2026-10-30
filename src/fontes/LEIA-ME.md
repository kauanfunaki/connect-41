# Fontes do Connect

As fontes ficam no repositório desde 30/10/2026. Antes vinham do `next/font/google`, que baixava os arquivos a cada build — e quando o download falhava o build caía com `next/font/google queries have exactly one entry` (foi o que derrubou o CI do #345).

| Arquivo | Fonte | Onde | Pesos | Caracteres |
|---|---|---|---|---|
| `IBMPlexSans-wght.woff2` | IBM Plex Sans (variável, largura 100) | texto do app | 400–700 | latin + latin-ext |
| `IBMPlexMono-400.woff2`, `IBMPlexMono-500.woff2` | IBM Plex Mono | números e códigos | 400, 500 | latin + latin-ext |
| `SpaceGrotesk-wght.woff2` | Space Grotesk (variável) | títulos do app | 500–700 | latin + latin-ext |
| `Unbounded-wght.woff2` | Unbounded (variável) | títulos do 41 Carreiras | 200–900 | latin |
| `HankenGrotesk-wght.woff2` | Hanken Grotesk (variável) | texto do 41 Carreiras | 100–900 | latin + latin-ext |

- **Origem:** os arquivos originais do repositório oficial do Google Fonts (`github.com/google/fonts`, pasta `ofl/`), recortados para os mesmos subsets que o `next/font/google` pedia.
- **Unbounded só com latin:** com latin-ext o arquivo ia de 46 para 192 KB. Ela é a fonte dos títulos das carreiras, escritos em português, que o latin cobre inteiro.
- **Recursos tipográficos mantidos:** os padrão (kerning, ligaduras, acentos) mais algarismos tabulares e alinhados (o app usa `tabular-nums`), ordinais (1º, 2ª), frações, caixa alta, sobrescrito e subscrito.
- **Licença:** SIL Open Font License 1.1, que permite incluir os arquivos no projeto. O texto de cada uma está no `OFL-*.txt` ao lado.

## Gerar de novo

Para trocar um peso ou incluir uma fonte:

1. Baixe o `.ttf` original de `github.com/google/fonts/tree/main/ofl/<fonte>`.
2. Instale as ferramentas: `python -m pip install --user fonttools brotli`.
3. Ajuste e rode o `scripts/fontes/gerar_fontes.py`:

```bash
python scripts/fontes/gerar_fontes.py <pasta-dos-ttf> src/fontes
```

4. Confira os pesos e os caminhos em `src/app/layout.tsx` e `src/components/carreiras/41/fontes.ts`.
