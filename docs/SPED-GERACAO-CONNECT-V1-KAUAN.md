# Geração por revisão do Connect — contrato v1 para o Kauan

**Connect entregue; adaptação do motor é responsabilidade do Kauan.** As rotas e agentes legados continuam compatíveis. Esta extensão não transfere a geração para o Next.js e não autoriza usar produção para testes.

## Fluxo e autenticação

1. O Connect consulta a saúde. Só oferece geração quando a capacidade `geracao_connect_v1` estiver presente, houver token de escrita e o estabelecimento corresponder ao CNPJ autorizado.
2. Congela no seu banco uma revisão validada e imutável. A captura verifica a revisão da raiz sob lock; edições posteriores não mudam o pacote. A chave de intenção identifica o pedido, inclusive após resposta incerta.
3. Envia o JSON em partes pelo mecanismo existente de upload. Uma parte já confirmada no estado do upload não é reenviada na retomada.
4. Conclui o pacote e pede a execução referenciando `pacote_id`. O motor confirma pacote, revisão e hash. O Connect nunca faz fallback para gerar com decisões antigas do banco do motor.

Usar o prefixo `/api/connect/v1`, `cnpj_raiz` na query, os tokens atuais de leitura/escrita, `X-Connect-Ator` derivado da sessão e `Idempotency-Key`. Não aceitar o ator do corpo como autoridade. Validar escritório, raiz, CNPJ, estabelecimento e obrigação antes de acessar um pacote.

## Extensões HTTP

### `GET /saude?cnpj_raiz=12345678`

Acrescentar `"capacidades": ["geracao_connect_v1"]` à resposta atual. Ausência dessa capacidade mantém as três áreas locais utilizáveis e a geração indisponível. Não anunciar a capacidade antes da implantação completa dos endpoints e agentes.

### `POST /uploads?cnpj_raiz=12345678`

Corpo adicional ao upload existente:

```json
{
  "nome": "connect-11111111-2222-4333-8444-555555555555.json",
  "tamanho": 2048,
  "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "finalidade": "geracao_connect_v1"
}
```

Exigir idempotência. Responder com o objeto Upload já usado pelo Connect: `id` com 32 caracteres hexadecimais, `nome`, `tamanho`, `tamanho_parte`, `partes_esperadas`, `partes_recebidas`, `recebido`, `estado`, `criado_por`, `criado_em`, `expira_em`. Não importar o pacote como XML nem disparar geração ao concluir o upload.

`GET /uploads/{id}`, `PUT /uploads/{id}/partes/{numero}` e o descarte de sessão mantêm seus contratos. A parte é `application/octet-stream` com tamanho declarado. Reenvio dos mesmos bytes é idempotente; bytes diferentes para a mesma parte são conflito. Conferir o hash integral ao concluir.

### `POST /uploads/{id}/concluir?cnpj_raiz=12345678`

Corpo: `{"sha256":"..."}`. Para esta finalidade, retornar:

```json
{"pacote_id":"pacote-imutavel-do-motor","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
```

Repetir a conclusão com o mesmo hash devolve o mesmo pacote. Validar versão, integridade, conteúdo e escopo. O pacote confirmado deve ser imutável e a associação upload → pacote deve sobreviver a reinício. A conclusão não depende de um `importacao_id` legado.

### `POST /execucoes?cnpj_raiz=12345678`

```json
{
  "acao": "sped",
  "empresa_id": 3,
  "competencia": "2026-09",
  "tipo_sped": "0",
  "parametros": {},
  "confirmar_duplicado": false,
  "pacote_id": "pacote-imutavel-do-motor"
}
```

`acao` é `sped` ou `sped_contribuicoes`; o tipo pode ser `0` ou `1`. Validar a correspondência desses campos com o pacote. Idempotência e reconciliação de resposta perdida seguem o contrato existente. Responder 202 com a Execução atual e, adicionalmente:

```json
{"pacote_id":"pacote-imutavel-do-motor","revisao_connect":7,"sha256_connect":"..."}
```

Os agentes precisam consumir a revisão recebida, usando adaptadores para seus tipos internos. Não consultar decisões mutáveis do painel antigo para substituir as decisões do pacote. Se faltar informação necessária à geração, recusar explicitamente e informar a pendência; não preencher dado fiscal por suposição. A adaptação deve preservar as regras e validações fiscais do motor e conferir seus resultados com a apuração enviada.

As leituras de execução e arquivo devem conservar os três metadados. As rotas de download, validação, relatório e entrega permanecem as mesmas. O TXT retornado continua com os bytes e encoding originais do motor. Arquivos legados sem metadados continuam consultáveis, mas não comprovam que uma revisão local foi utilizada.

## Pacote e schemas

O [JSON Schema](contracts/sped-geracao-connect-v1.schema.json) é gerado de `src/lib/fiscal/sped/local/contrato.ts`. Regenerar com `node scripts/gerar-schema-sped-fiscal.mjs`.

O pacote contém `versao`, `finalidade`, escritório, raiz, competência, obrigação, tipo de arquivo, revisão, estabelecimentos/perfis, documentos/itens, documentos de apoio, decisões com autor/data, parâmetros e apuração calculada. O schema descreve os campos normalizados transmitidos; a adaptação deve recusar recursos/valores que não consiga representar fielmente.

- Valores monetários, quantidades e alíquotas são textos decimais com ponto. `null` significa não levantado. Zero é valor confirmado.
- ICMS/IPI é por estabelecimento. Contribuições usa explicitamente os estabelecimentos da raiz autorizada, com identificação em cada documento.
- Classificação permanente é por raiz, fornecedor e produto; crédito de ICMS inclui estabelecimento e competência. Tributação por item inclui CNPJ, competência, documento e posição.
- O hash é SHA-256 do JSON UTF-8, sem BOM ou nova linha final, com chaves de todos os objetos ordenadas lexicograficamente por código UTF-16; arrays preservam a ordem. Implementação de referência: `serializarPacote` em `local/pacote.ts`. Não hashear uma reserialização com ordem, espaços ou escaping diferentes.
- O hash não inclui campos de transporte, upload ou execução. A mesma intenção deve usar os mesmos bytes mesmo se a base local mudar depois.

## Erros e aceite

Manter o envelope de erros da API atual. Usar 404 para pacote de outro escopo; 409 para hash/conteúdo/intenção conflitante; 422 para versão, cadastro ou conteúdo incompatível; 503 para indisponibilidade, com `Retry-After` quando aplicável. Depois de resposta incerta, consultar estado/idempotência antes de reenfileirar.

**Kauan:** implementar capacidade, upload/pacote, persistência da associação, consumo pelos agentes e metadados dos arquivos. Conferir cancelamento, reinício, duplicidade, retificação e coexistência do painel legado. Homologar ICMS/IPI e Contribuições com amostras autorizadas. O Connect já tem testes de transporte simulado, pacote imutável, retomada após perda de resposta e não repetição da execução; esses testes não validam o motor real nem o PVA.
