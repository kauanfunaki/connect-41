# Fluxo SPED no ambiente local

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
