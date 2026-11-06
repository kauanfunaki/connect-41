# Revisão contábil (AudTool) no Connect

O módulo de revisão do fechamento contábil é o antigo **AudTool**, também chamado Connect Revisão Contábil. Ele recebe os documentos do fechamento de uma empresa e confere cada um:
- balancete, balanço e DRE;
- razão;
- declaração de faturamento;
- relatórios de serviços e de entradas;
- comprovantes do e-CAC.

Ele aponta inconsistências por item do "Manual de Conferência do Balanço" do time contábil. Não faz lançamentos, não ajusta saldos e não substitui o revisor.

## Origem

- **Repositório:** `ArchangelumC/ContabilAudTool`, `main` em `92658a2`. É a versão R_12 provisória (R_11 com os blocos 1 a 6 do plano de leitores), de 03/11/2026.
- **Autoria:** o Marcos montou a versão original, e o Angelo fez os blocos da R_12.
- **Como era:** um app de navegador, com o motor em Python rodando no Pyodide. Os dados ficavam no navegador de cada pessoa, sem banco nem login.
- **Situação:** o original fica congelado. As próximas mudanças pedidas pelo time contábil são feitas aqui.

O projeto foi pausado antes da validação pelo time contábil. Continuam **a validar**:
- o mapeamento item → regras do manual;
- as gravidades;
- os critérios internos: saldo antigo acima de 90 dias, janela de 5 dias entre a guia e a baixa, prazo do pró-labore no fim do mês seguinte;
- a numeração oficial dos itens.

## Fases

| Fase | Branch | O que entra |
|---|---|---|
| 1 | `feat/revisao-contabil-motor` | Motor em TypeScript e testes-gabarito. Sem tela, sem banco, sem rota. |
| 2 | `feat/revisao-contabil` | Banco (fechamentos, documentos, execuções e acompanhamento dos achados), upload, telas, relatório e ajuda. O módulo nasce desligado. |
| 3 | — | Pendências do time contábil: itens de conferência manual marcados na tela, critérios ajustáveis por escritório, mapeamento revisado. |
| 4 | — | Integrações: guias pelo SERPRO (PAGTOWEB) no lugar do PDF do e-CAC; notas do índice do SPED para vendas (C01) e CFOP (C03). |

## O motor (`src/lib/revisao-contabil/motor/`)

| Arquivo | Origem no AudTool | Conteúdo |
|---|---|---|
| `py.ts` | — | Comportamentos do Python que mudam resultado. Inclui a regex com a semântica do Python: `\b` e `\w` enxergam acento; `match` e `fullmatch`. Inclui também `split`, `strip`, `splitlines`, a verdade de contêiner vazio e o `Decimal` meio-para-par. |
| `csvPython.ts` | módulo `csv` do Python | `Sniffer`, leitor, `DictReader` e escritor. |
| `base.ts` | `engine.py` | Normalização, centavos, meses, dias úteis e feriados nacionais. |
| `leitura.ts` | `engine.py` | Leitores: razão, faturamento, serviços e entradas, e-CAC, balancete/DRE/balanço e CSV. |
| `arquivo.ts` | `engine.py`, `pdfextract.py` | Entrada de PDF, CSV/TXT, .xlsx e ZIP. |
| `razao.ts` | `engine.py` | Regras sobre os lançamentos (blocos 2a e 2b) e soma por prefixo. |
| `fiscal.ts` | `engine.py` | Documentos fiscais × contabilidade (bloco 3). |
| `pagamentos.ts` | `engine.py` | e-CAC × baixas no razão (bloco 4). |
| `balancete.ts` | `engine.py` | Regras do balancete (bloco 5). |
| `manual.ts` | `engine.py` | Matriz por item do manual (bloco 6). |
| `analise.ts` | `engine.py` | `analyse`: R01, R02, R04, R05, R06, R15 e a chamada dos blocos. |
| `execucao.ts` | `adapter.py` | Importação e execução, com as validações (correções, tolerância, vínculo). |
| `relatorio.ts` | `review-state.mjs` | Assinaturas que invalidam uma execução e relatório em Markdown. |

**Os nomes de campo do resultado são os do original:**
- `tests`, `findings`, `summary`, `manual`;
- `difference` em centavos;
- `Finding.value` em reais.

A tela da Fase 2 lê esse formato, e a execução fica gravada nele.

## As telas e o banco (Fase 2)

O módulo é o `contabil_revisao`, "Revisão do fechamento", no setor Contábil, grupo Conferência. Ele nasce **desligado** e é ligado em Setores e módulos. A rota é `/revisao-contabil`.

| Onde | O que é |
|---|---|
| `/revisao-contabil` | Os fechamentos em revisão, do mais recente ao mais antigo, com busca por empresa ou CNPJ e o botão "Novo fechamento". |
| `/revisao-contabil/[id]` | O fechamento, em abas: Documentos, Análise, Inconsistências, Manual e Relatório. |
| `/revisao-contabil/[id]/documentos/[docId]` | A conferência da leitura de um documento. No balancete, cada linha pode ser corrigida. |
| `src/app/api/revisao-contabil/` | O envio (um arquivo por requisição, com progresso), o arquivo original e os downloads da execução (`.md`, `.csv`, `.json`). |
| `src/lib/revisao-contabil/servidor.ts` | O banco. As regras puras ficam em `fechamento.ts` e as listas da tela em `regras-da-tela.ts`. |

**Banco:** a migration `20261106130000_revisao_contabil` só cria tabelas novas.

| Tabela | O que guarda |
|---|---|
| `revisao_fechamentos` | Empresa do cadastro, período, regime, enquadramento, finalidade, tolerância (centavos) e correções de leitura. |
| `revisao_documentos` | Nome, SHA-256, o que o motor leu (`fatos`, em JSON), se entra na análise e o caminho do original em `storage/revisao-contabil/<tenant>/<uuid>.<ext>`. |
| `revisao_execucoes` | O resultado inteiro do motor e duas assinaturas (SHA-256), uma do cadastro e outra das entradas. |
| `revisao_acompanhamentos` | Responsável, estado e anotação de cada achado de uma execução. |

**Decisões da Fase 2:**
- **Empresa:** é a do cadastro do Connect, sem cadastro próprio. Só entra empresa com CNPJ, porque o motor confere o CNPJ de cada documento. A empresa não muda depois de aberto o fechamento.
- **Regime:** vem como sugestão do cadastro da empresa (`taxRegimeKind`). Imune/isenta, produtor rural e doméstica ficam "Não informado", para quem revisa escolher.
- **Execução desatualizada:** fica marcada como desatualizada, sem ser apagada.
  - Mudar o cadastro, um documento, uma correção ou a tolerância faz a tela avisar que a análise não vale mais.
  - A regra é a do `review-state.mjs`: `contextKey` e `inputKey` em SHA-256.
- **Acompanhamento:** vale para uma execução. Uma execução nova começa sem acompanhamento, porque os achados são renumerados (G01, G02…), como no original. O das execuções anteriores continua no relatório delas.
- **Permissões:** trabalhar no fechamento (enviar, corrigir, executar, acompanhar) é "agir" no setor. Excluir o fechamento é "gerir".
- **Exclusão da empresa:** apaga os fechamentos e os arquivos (`src/lib/exclusao`). Quem abriu, enviou ou executou fica como registro.
- **Do original que não veio para as telas:**
  - **"Plano de ação":** virou o acompanhamento na aba Inconsistências.
  - **"Conciliações":** era a mesma tela genérica.
  - **"Regras":** era a lista R01–R16. A tolerância está na aba Análise.
  - **"Manual" do usuário:** virou o artigo da ajuda (`src/lib/ajuda/artigos/contabil.ts`).

**Teste de ponta a ponta (05/11/2026):**
- **Ambiente:** banco local separado (contêiner `connect41-revisao`, porta 3308) e app na porta 3101.
- **Arquivos:** só os sintéticos do gabarito.
- **Camada do servidor:** 21 conferências, por exemplo:
  - envio, ZIP e `.xls`;
  - documento desligado, correção e tolerância invalidam a análise;
  - acompanhamento no relatório;
  - outro escritório não enxerga o fechamento;
  - a exclusão apaga linhas e arquivos.
- **Telas (Playwright no Edge):**
  - envio;
  - execução;
  - acompanhamento;
  - filtros;
  - manual;
  - relatório e os três downloads;
  - conferência da leitura;
  - download sem login recusado;
  - nenhum erro no navegador.

## Desvios deliberados

Fora destes pontos, o porte é cópia fiel.

1. **PDF pelo pdf.js (`unpdf`), não pelo pdfminer.**
   - As linhas são montadas com as regras do `pdfextract.py`: mesma altura com folga de 0,7, espaço quando a distância passa de 1,5, trecho repetido descartado.
   - Em 05/11/2026, com os 12 PDFs das três empresas de teste, a análise saiu idêntica à do original. Mudam só o texto original e o número de algumas linhas, e espaços no histórico do razão, que as regras não usam.
   - Ganho de tempo: o razão de 63 páginas leva 0,5 s, contra cerca de 51 s no Pyodide.
2. **`.xls` (Excel 97-2003) é recusado** com aviso para enviar `.xlsx` ou CSV. O Connect não tem leitor de `.xls`.
3. **Sem a marca KPMG.**
   - O original citava um "roteiro interno KPMG", com a ressalva de que não havia vínculo com a KPMG. Era o nome de uma skill usada para montar a ferramenta, sem relação com a empresa.
   - Num módulo que pode ser vendido a escritórios, a marca sai. O Angelo deixou o novo nome a nosso critério em 05/11/2026.
   - O texto passa a ser "Roteiro interno de revisão documental. Não constitui auditoria independente." (`IDENTIFICACAO` em `relatorio.ts`).
4. **Não vêm do original:**
   - backup e restauração em JSON;
   - "Zerar base";
   - IndexedDB e localStorage;
   - Pyodide e o servidor estático.

   No Connect, os dados ficam no banco e os originais em `storage/`.

## Testes-gabarito

O comando é `npx vitest run src/lib/revisao-contabil`.

- **`gabarito.test.ts`:**
  - repete 680 chamadas gravadas da suíte do original e exige o mesmo resultado, campo a campo;
  - confere as 33 tabelas do motor (padrões, prazos, manual) contra as do original;
  - confere a execução pelo adapter.
- **`relatorio.test.ts`:** os testes de relatório e validade do original.

O gabarito é `motor/gabarito/sinteticos.json.gz`.
- **Dados:** só sintéticos. Os testes do original não usam documento real, e os casos de CSV, Excel e ZIP são inventados.
- **Como refazer:**

```bash
python -I scripts/revisao-contabil/gerar-gabarito.py <pasta do AudTool> src/lib/revisao-contabil/motor/gabarito/sinteticos.json.gz
```

**Regressão com os PDFs reais (05/11/2026, fora do git):**
- Três empresas de teste e 12 PDFs: balancete, balanço, DRE, razão, faturamento, serviços, entradas e e-CAC.
- O porte e o original deram fatos e análise idênticos com o mesmo texto, inclusive o rastreio, e análise idêntica contra o texto do pdfminer.
- Com o regime "Não informado", como no teste do navegador de 03/11, a empresa com razão deu os 12 achados e a matriz registrados no original.

**Quando o time pedir mudança numa regra:**
1. Altere o motor aqui.
2. Atualize ou acrescente o teste do caso.
3. Registre a mudança nesta página.

O gabarito do original mostra o que mudou em relação a ele. Teste que muda por decisão do time sai do gabarito com o motivo no `DESVIOS` do teste.
