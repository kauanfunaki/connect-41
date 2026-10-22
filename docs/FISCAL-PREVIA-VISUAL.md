# Fluxo SPED no ambiente local

> **Modo real (22/10/2026).** Com a integração `sped` ligada e completa
> (URL + token de serviço) no escritório, as telas fiscais deixam a prévia e
> operam o motor SPED pela API `/api/connect/v1` (contrato: `docs/API-CONNECT.md`
> no repositório do motor). A prévia abaixo continua valendo no banco local de
> desenvolvimento quando a integração não está configurada. Ver "Modo real" no
> fim deste arquivo.

As operações fiscais usam dados fictícios, persistidos no MySQL local `connect41`
na porta 3307, por escritório e usuário. Não há extração externa, agente, PVA,
transmissão ou geração de arquivo fiscal real. O acervo integrado em
`/documentos-fiscais` mantém seu contrato próprio.

## Navegação

O menu lateral apresenta uma entrada **SPED**, que abre ao passar o mouse ou
clicar. Na faixa de ícones e no celular, o clique/toque também abre as opções,
sempre sujeitas aos módulos habilitados:

- **Classificação e apuração** abre Classificação. Seu menu superior tem Classificação, Apuração,
  De-Para CFOP, Regras e DCIP e DIME. Sem Classificação, abre a primeira área
  habilitada nessa ordem; o painel e as outras páginas antigas continuam acessíveis.
- **SPED gerados** (`/fiscal/entregas`) consulta as versões e suas ações.
- **Executar** (`/fiscal/operacao`) tem somente as abas Executar e Histórico.

A ordem da página é menu contextual, trilha, cabeçalho, empresa/estabelecimento/
competência, avisos e conteúdo. O cabeçalho global do Connect permanece no topo.
Classificação usa uma lista, com filtros para produtos, contratos/recibos e situação.
Na Apuração, a obrigação é escolhida em um campo; demonstrativo, ajustes e decisões
ficam em seções recolhíveis. DCIP e DIME tem um acesso superior próprio.
Parâmetros ficam disponíveis pela ação contextual da Apuração. De-Para CFOP
continua indisponível enquanto não houver dados do motor; Regras é somente leitura.

## Executar e acompanhar

1. Escolha empresa, estabelecimento e competência. Informe solicitante, se desejar,
   e as datas inicial/final. O cenário oferece setembro e outubro de 2026.
2. Abra Extração paralela, Extração única, Retentar erros ou Gerar SPED.
3. Solicite o pedido. Ele fica **Na fila**, salvo no banco.
4. Use **Simular início**, depois **Simular conclusão** ou **Simular falha**.
   Não há processamento autônomo nem estimativas inventadas.
5. O log e o Histórico registram parâmetros, horários, duração e resultado.
   Cancelar vale para pedidos ainda na fila. Uma nova tentativa preserva o erro
   anterior e cria outro pedido; não é possível duplicar uma tentativa pendente.

Os valores iniciais seguem a referência: extração paralela com 4 instâncias e
32 workers por instância; extração única com 8 workers; tentativa dos erros com
32 workers. Os limites são 1–16 instâncias e 1–64 workers. As etapas first_mile
e last_mile começam selecionadas. Esses parâmetros descrevem somente a simulação.

A conclusão da extração recebe documentos fictícios; Retentar erros recupera a
quarentena do contexto. Depois, classifique os pendentes, simule a apuração e
feche a competência. A geração exige um mês inteiro e escolha explícita entre
Original e Substituto. ICMS/IPI gera uma versão por estabelecimento; Contribuições
reúne os estabelecimentos da empresa. As opções de forçar erros/cobertura são
exclusivas de ICMS/IPI. Nomes de saída não aceitam caminhos; as prévias têm nomes
únicos por versão, preservando o nome solicitado nos parâmetros do pedido.

## Consultar SPED gerados

Filtre obrigação, vigência e situação. Versões anteriores permanecem consultáveis.
As ações permitem ver/baixar uma amostra marcada **SEM VALIDADE FISCAL**, simular
validação, consultar o resumo da apuração salvo na geração e registrar uma entrega
fictícia quando a versão estiver aprovada, vigente e atualizada.

A validação informa pendências do cenário, sem consultar o PVA. Alterar documentos,
ajustes ou parâmetros sinaliza as versões afetadas para revisão. A apuração salva
no arquivo não muda. Registros antigos sem resumo ou parâmetros mostram informação
indisponível; não recebem valores históricos inventados. Uma execução antiga sem
parâmetros suficientes orienta a preparar outro pedido em Executar.

**Gerar novo SPED** abre a seção de geração em Executar. Validação, relatório e
entrega abrem em detalhes, sem outra fileira de abas.

## Compatibilidade e operação

Os códigos de módulo, rotas e controles de acesso foram preservados. Favoritos
antigos continuam funcionando. As antigas abas de Classificação viram filtros;
as abas de Apuração abrem as respectivas seções; os links de validação/entrega
continuam na consulta de arquivos. O endereço antigo do SPED Contribuições abre
SPED gerados filtrado pela obrigação.

Os dados são salvos exclusivamente no banco local, com revisão condicional para
evitar sobrescrita por outra aba. O navegador não guarda o cenário fiscal.
**Restaurar dados de teste**, no menu do cabeçalho, exige confirmação e restaura
somente o cenário do usuário e escritório atuais. Atualizar a interface não exige
recriar o banco, aplicar migration ou restaurar dados existentes.

Execute comandos pelo lançador `scripts/local/com-banco-local.mjs`; o `.env` da
raiz não deve ser usado para testes. Veja `scripts/local/README.md`.

## Verificação

- Testes puros: `npx vitest run src/lib/fiscal src/components/fiscal/previa "src/app/(app)/fiscal"`.
- Interface: com o servidor local iniciado pelo lançador, defina `SPED_QA_URL`
  para seu endereço e execute, pelo mesmo lançador,
  `npx tsx scripts/local/verificar-sped-ui.ts`.
- O verificador recusa banco/servidor não local, cria uma conta temporária,
  percorre o fluxo, verifica persistência e download e remove somente a conta
  criada. Capturas e amostra fictícia ficam em `.local/sped-qa/evidencias`.
- As capturas cobrem temas claro/escuro, menu recolhido e áreas úteis equivalentes
  a 100%, 125%, 150% e 200% em uma tela de 1366 × 768. Isso não equivale a alterar
  a escala nativa do Windows.
- O relatório `resultado-ui.json` também registra avisos conhecidos de medição
  de tempo do profiler React/Next em desenvolvimento, separados dos erros de
  aplicação. Outros erros de console ou da página reprovam a verificação.

## Modo real (motor SPED)

Escolha da fonte (`src/app/(app)/fiscal/layout.tsx`, `src/lib/fiscal/motor/modo.ts`):
motor configurado → telas reais; senão, banco local de demonstração → prévia;
senão, "Processamento fiscal indisponível".

Configuração, em Administração → Integrações → SPED Generator (só administrador):

- **URL do SPED** e **Token de serviço**: os mesmos de hoje. O token de serviço
  vale para `/api/integracao` e para a leitura do v1 (o motor usa o mesmo valor
  em `CONNECT_TOKEN_LEITURA`).
- **Token de escrita** (opcional): o `CONNECT_TOKEN_ESCRITA` do motor. Sem ele as
  telas só consultam e as ações aparecem desabilitadas ("escrita do SPED não
  habilitada"). A tela mostra só "configurado"/"não configurado".
- **Testar conexão** faz `GET /saude` na primeira raiz do escritório.
- As raízes vêm de `sped_sync_roots` (piloto: `17122471`); o motor também precisa
  dela em `CONNECT_RAIZES_PERMITIDAS`.

O que cada tela faz no modo real:

| Tela | Fonte e ações |
|---|---|
| Painel | `/saude` (agentes, banco, fila da raiz, itens destraváveis) e contagem dos arquivos da competência |
| Executar | pedido para a fila (`POST /execucoes`) validado como na prévia; duplicata pede confirmação; fila aberta |
| Histórico | `GET /execucoes` por cursor, filtros Estado e Ação; detalhe com o log atualizado a cada 4 s; Cancelar (agir) e Destravar (gerir) |
| SPED gerados | `GET /arquivos`; detalhe com totais, validação, entrega e decisões depois da geração (`defasado`); baixar (bytes do motor sem alteração), regerar, validar e registrar entrega |
| SPED gerados › Entregas | decisão `entrega_competencia` (qual arquivo vale) |
| Classificação | Produtos: `classificacao_item` e `credito_icms_item`; Contratos e recibos: `documento_apoio_categoria` e `credito_documento_apoio` |
| ICMS e IPI › Ajustes | `ajuste_apuracao` |
| PIS e COFINS | Ajustes (`ajuste_contribuicoes`), Decisões por registro (`decisao_registro_contribuicoes`) e Parâmetros (`parametro_contribuicoes`) |
| Configurações › Empresas | cadastro do estabelecimento no motor (`PUT /empresas`, parcial) e divergências do vínculo Company ↔ estabelecimento |
| Documentos, Conferência, apuração e demonstrativos | sem endpoint no motor: "ainda não disponível no Connect", nunca dado fictício |

Permissões: ler exige o módulo da tela; operar exige `agir` no módulo
(execuções e regerar em `fiscal_operacao`; validar, entregar e
`entrega_competencia` em `fiscal_entregas`; decisões no módulo do tipo);
destravar e editar o cadastro exigem `gerir`; apagar decisão exige também o
perfil que exclui. O motor confere de novo (token, raiz, `CONNECT_DECISOES_ESCRITA`).

Toda escrita leva o ator da sessão (`X-Connect-Ator`) e uma `Idempotency-Key`
criada quando o formulário abre: duplo clique e nova tentativa repetem a mesma
chave; depois de sucesso ou recusa, a próxima ação usa outra. Cada escrita
também vai para a auditoria do Connect (`fiscal.sped.*`).
