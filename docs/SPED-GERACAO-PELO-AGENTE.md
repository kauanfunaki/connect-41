# Geração do SPED pelo agente do motor

Contrato de 06/11/2026. Ele substitui o contrato v1, em que o Connect enviava a revisão para a API do app do motor (`POST /uploads` e `POST /execucoes` em `/api/connect/v1`).

O motor passou a rodar por fora, sem o app do EasyPanel, e a direção inverteu. Agora o Connect guarda o pedido, e o agente do motor vem buscar. O motor não abre porta de entrada, e a credencial do banco do SPED não passa pelo Connect.

## Como funciona

1. No **Gerar SPED**, a pessoa pede o arquivo. O Connect congela uma revisão imutável dos dados (o pacote, com o SHA-256 dele) e cria a tarefa `gerar_sped` na fila (`RobotTask`). Essa fila é a mesma do robô do Societário.
2. O agente do motor é uma automação do Ops Center. Ele pede trabalho dizendo que sabe `gerar_sped`, e o pedido também vale como sinal de vida.
3. O agente baixa o pacote, confere o SHA-256 e gera o TXT **só a partir do pacote**.
4. O agente manda o TXT em partes de até 8 MiB e devolve a tarefa com o nome, o tamanho e o SHA-256 do arquivo.
5. O Connect junta as partes, confere o tamanho e o hash e libera o download na própria tela.

Se faltar dado para gerar, o agente recusa e diz o que falta. A pendência vai para quem pediu, como aviso.

## Configurar a máquina (uma vez)

1. Ligue o módulo **Ops Center** no escritório. Sem ele, o Gerar SPED avisa e não deixa pedir.
2. Em **Ops Center**, crie a automação, por exemplo com o identificador `agente-sped`. Deixe-a ativa e com responsável.
3. Em **Administração › Integrações › Ops Center**, crie uma chave adicional com nome, por exemplo "Agente SPED — máquina do escritório". Ela aparece **uma vez só**: copie na hora.
4. Na máquina do agente, configure as três variáveis que o `agente.py` já lê para o sinal de vida:
   - `OPS_URL`: o endereço do Connect, por exemplo `https://app.useconnect.com.br`
   - `OPS_TOKEN`: a chave do passo 3
   - `OPS_SLUG`: o identificador do passo 2

   A chave não vai para o git, o chat, o vault nem o Controle interno.
5. Rede: a máquina só precisa de **saída** HTTPS até o Connect. Nenhuma porta de entrada.

Para revogar, use a mesma tela do passo 3. A máquina passa a receber 401 na hora seguinte.

## Rotas

Todas ficam sob `${OPS_URL}/api/ops/watchers/${OPS_SLUG}` e levam `Authorization: Bearer ${OPS_TOKEN}`. Os erros vêm como `{"error": "…"}`.

| Passo | Método e caminho | Envio | Resposta |
|---|---|---|---|
| Pedir trabalho | `POST /tarefas` | JSON `{"capacidades": ["gerar_sped"], "versao": "…"}`, até 32 KiB | `{"tarefa": null}` ou `{"tarefa": {"id", "tipo": "gerar_sped", "tentativa", "dados"}}` |
| Sinal de vida | `POST /heartbeat` | sem corpo | `{"ok": true}` |
| Baixar o pacote | `GET /tarefas/{id}/pacote` | — | os bytes do pacote (`application/json; charset=utf-8`), com `X-Conteudo-SHA256` e `Content-Length` |
| Enviar uma parte | `PUT /tarefas/{id}/partes/{n}` | `application/octet-stream`, `Content-Length` até 8 MiB, `X-Parte-SHA256` | `{"numero", "tamanho", "repetida"}` |
| Devolver | `POST /tarefas/{id}` | JSON, ver abaixo | `{"ok": true, "status": "CONCLUIDA" \| "PENDENTE" \| "PRECISA_DE_GENTE"}` |

### `dados` da tarefa

| Campo | O que é |
|---|---|
| `revisao_id` | O id da revisão congelada no Connect |
| `raiz` | A raiz do CNPJ, com 8 dígitos |
| `cnpj` | O estabelecimento do arquivo: o da empresa no ICMS/IPI e a matriz no Contribuições |
| `competencia` | `AAAA-MM` |
| `obrigacao` | `icms_ipi` ou `contribuicoes` |
| `tipo_sped` | `0` para original, `1` para substituto |
| `sha256` | O SHA-256 dos bytes do pacote |
| `tamanho` | O tamanho do pacote, em bytes |

### Devolução

O arquivo saiu:

```json
{ "ok": true, "resultado": { "arquivo": { "nome": "sped_icms_2026-09.txt", "tamanho": 1048576, "sha256": "…64 hexadecimais…", "partes": 1 }, "motor": { "versao": "…" } } }
```

Não saiu:

```json
{ "ok": false, "motivo": "Falta o perfil fiscal da filial 0002.", "recuperavel": false }
```

- `recuperavel: true` é falha de máquina: queda, tempo, hash do pacote diferente. A tarefa volta para a fila enquanto houver tentativa; o limite é 2.
- `recuperavel: false` é algo que o agente não decide, como dado faltando ou leiaute que não representa o caso. A tarefa vai direto para quem pediu, com o motivo.

## Regras do agente

- **Conferir o pacote antes de gerar.** Os bytes baixados têm de dar o mesmo SHA-256 de `dados.sha256` e do cabeçalho `X-Conteudo-SHA256`. Se não derem, devolva `recuperavel: true`.
- **Gerar só do pacote.** As decisões, os parâmetros e a apuração vêm nele. Não consultar `classificacao_itens`, `ajustes_apuracao` nem outras decisões mutáveis do painel antigo para completar ou substituir o que veio. Se faltar dado, recuse, sem preencher dado fiscal por suposição.
- **Bytes do arquivo:** ISO-8859-1 com CRLF, como o `db.gravar_texto_em_lotes` grava hoje. O `sha256` da devolução é o dos bytes exatos enviados.
- **Partes:**
  - cada uma tem 8 MiB (8.388.608 bytes), numeradas a partir de 1, com a última menor;
  - o teto é de 500 MiB no total (63 partes);
  - reenviar a mesma parte com os mesmos bytes é seguro (`repetida: true`); com outros bytes, a resposta é 409;
  - cada tentativa da tarefa tem a própria pasta: depois de uma falha, a próxima tentativa manda tudo de novo.
- **Prazo de 60 minutos** desde que a máquina pegou a tarefa. Passou disso, a tarefa é dada como perdida e volta à fila ou vai para uma pessoa. Durante uma geração longa, mande `POST /heartbeat` a cada 30 segundos a 5 minutos, para a tela mostrar a máquina como ligada.
- **409 em qualquer rota** quer dizer que a tarefa não está mais com esta máquina (venceu o prazo ou alguém tirou da fila). Pare e descarte o que estiver gerando.
- **O pacote tem dado fiscal do cliente.** Apague-o da máquina depois de devolver.

### Erros das rotas

| Status | Quando |
|---|---|
| 400 | Formato: JSON, número da parte, tamanho diferente do declarado |
| 401 | Chave inválida ou revogada |
| 403 | Escritório inativo, assinatura só leitura ou Ops Center desligado |
| 404 | Tarefa ou automação que não existe |
| 409 | Tarefa fora desta máquina, parte já recebida com outros bytes, parte faltando na devolução |
| 410 | A revisão ou a geração da tarefa não existe mais |
| 411 / 413 / 415 | Parte sem `Content-Length`, acima de 8 MiB ou sem `application/octet-stream` |
| 422 | Parte ou arquivo montado com SHA-256 ou tamanho que não conferem |

## O pacote

O [JSON Schema](contracts/sped-geracao-connect-v1.schema.json) é gerado de `src/lib/fiscal/sped/local/contrato.ts`; para regenerar, rode `node scripts/gerar-schema-sped-fiscal.mjs`.

O pacote traz:
- `versao`, `finalidade`, escritório, raiz, competência, obrigação e tipo de arquivo;
- a revisão;
- os estabelecimentos com o perfil de cada um;
- os documentos com os itens e os documentos de apoio;
- as decisões com autor e data, os parâmetros por competência e a apuração calculada;
- o bloco `escrituracao` (desde 06/11/2026), com o que o EFD ICMS/IPI exige e os blocos acima não trazem.

### O bloco `escrituracao`

O mapeamento de cada campo para o arquivo está em `docs/CONNECT-PACOTE-ICMS.md`, no repositório do motor (sped_generator#59). No Connect, quem monta o bloco é `src/lib/fiscal/sped/local/escrituracao.ts`; o leitor do XML é `escrituracaoXml.ts`.

| Parte | De onde vem |
|---|---|
| `estabelecimento` | Razão social, nome fantasia, endereço, CEP, telefone e e-mail vêm do cadastro da empresa. A inscrição estadual também vem do cadastro (etapa "Dados fiscais"). O código IBGE do município, o perfil (A/B/C), a atividade, o contabilista (nome, CPF, CRC), a conta contábil e o código de observação padrão vêm da etapa "SPED fiscal". Empresa sem contabilista usa o padrão do escritório, em Administração › Dados e e-mail de envio, sempre inteiro: nome, CPF e CRC de uma fonte só. O código de receita e o dia do vencimento do ICMS vêm do **perfil fiscal**. O endereço e o município que faltarem no cadastro saem do XML em que a própria empresa aparece. |
| `participantes` | O XML guardado de cada documento: CNPJ/CPF, nome, IE, município e endereço de emitente, destinatário, remetente, expedidor, recebedor e tomador. Fica um por CNPJ/CPF, o cadastro mais completo. |
| `documentos` | O XML guardado, por `id` do documento no pacote. NF-e: `tpNF`, `infCpl`, `vDesc` e, por item (`ordem`), `unidade`, `origem`, `vProd`, `vDesc` e `vICMSST`. CT-e: `tpCTe`, `chaveRef`, `tomador`, `munIni` e `munFim`. |

- **Documento sem XML guardado** (veio do TXT, ou o arquivo saiu do disco) não entra em `documentos`. O motor recusa e diz qual falta.
- **Conferência antes da fila** (`conferenciaDoArquivo.ts`): no EFD ICMS/IPI, o Connect recusa o pedido quando falta o que o motor exige. Isso vale para o cadastro do estabelecimento, que se resolve todo no cadastro da empresa (razão social, CEP, endereço, inscrição estadual com dígito, perfil, indicador de atividade, município IBGE e contabilista), para a nota sem o XML guardado e para a outra parte sem endereço ou município. A tela do Gerar mostra as faltas do cadastro antes do clique. Ela espelha `_empresa` e `_participante` do `gerador_connect_icms.py`: mudou lá, muda aqui.
- **Entidades:** as do XML chegam decodificadas (`&amp;` vira `&`).
- **Ausência de campo:** desconto e ST ausentes no XML viram `"0.00"`. Campo de cadastro que o Connect não tem vai como texto vazio, e `diaVencimento` vai como `null`.
- **Revisão antiga:** congelada antes de 06/11/2026, não tem o bloco.

Regras de leitura:
- Valores monetários, quantidades e alíquotas são texto decimal com ponto. `null` quer dizer não levantado; zero é valor confirmado.
- O ICMS/IPI é por estabelecimento. O Contribuições usa os estabelecimentos da raiz, com a identificação em cada documento.
- O hash é o SHA-256 do JSON em UTF-8, sem BOM e sem quebra de linha no fim, com as chaves de todos os objetos em ordem pelo código UTF-16; os arrays mantêm a ordem. A implementação de referência é `serializarPacote`, em `src/lib/fiscal/sped/local/pacote.ts`. Não confira o hash de uma reserialização com outra ordem, outros espaços ou outro escape.

## Testar sem o motor

`scripts/local/agente-sped-de-teste.mjs` faz o papel do agente contra um Connect **local**: pede a tarefa, baixa e confere o pacote, devolve um TXT fictício em partes e conclui. O arquivo aparece para baixar no Gerar SPED. Ele recusa qualquer endereço que não seja local, porque concluiria tarefas de verdade com um arquivo falso.

```powershell
$env:OPS_URL = "http://127.0.0.1:3127"; $env:OPS_TOKEN = "<chave local>"; $env:OPS_SLUG = "agente-sped"
node scripts/local/agente-sped-de-teste.mjs --uma-vez
```

`--tamanho-mb=20` aumenta o arquivo para exercitar várias partes. `--falhar` devolve uma falha recuperável.

## O que falta no motor

- O modo do `agente.py` que pede `gerar_sped` ao Connect e segue este contrato.
- O adaptador do pacote para o `pipeline.py` e o `pipeline_contribuicoes.py`. Hoje a geração lê o XML bruto e as decisões do banco do SPED: `buscar_xmls_*`, `classificacao_itens`, `ajustes_apuracao`, `saldos_apuracao` e os `dados/*.json`.
- A cadeia de saldos do Contribuições (K1.2). Ela precisa sair do pacote (`parametros` da competência) ou ter um dono no agente, sem duas cópias do saldo.
- A homologação do ICMS/IPI e do Contribuições com amostras autorizadas e a validação no PVA. O Connect testa o transporte com um agente fictício, o que não valida o motor nem o PVA.
