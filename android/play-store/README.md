# Portal 41 na Google Play — ficha da loja

Tudo o que o Play Console pede para publicar o app Android do portal (TWA,
`br.com.useconnect.portal`, ver `../README.md`). Os textos estão prontos para
colar. Preparado em 25/09/2026. A conta e a taxa ficaram para segunda-feira
(29/09) — **antes de 30/09**, quando começa no Brasil a verificação de
desenvolvedor do Google.

## 0. Conta de desenvolvedor (Kauan/Marcos)

- Tipo: **Organização** — fica isenta da regra de 12 testadores por 14 dias, que
  vale só para conta pessoal.
- Organização: **41 TEC LTDA** · CNPJ 64.620.403/0001-16 · **D-U-N-S 580294276**
- Endereço: Rua Anne Frank, 2210, Boqueirão, Curitiba/PR, 81650-020 — **igual**
  ao do cadastro D-U-N-S e ao do perfil de pagamentos do Google, senão a
  verificação trava.
- Site: `https://41contabil.com.br`
- E-mail e telefone do desenvolvedor: do Marcos (`marcos@41contabil.com.br`).
  Os dois são verificados por código e ficam públicos na página do app.
- Taxa única: US$ 25.

## 1. Criar o app

| Campo | Valor |
|---|---|
| Nome do app | `Portal 41` |
| Idioma padrão | Português (Brasil) – pt-BR |
| App ou jogo | App |
| Gratuito ou pago | Gratuito |

## 2. Ficha principal da loja

**Nome (até 30):** `Portal 41`

**Descrição curta (até 80)** — 79 caracteres:

```
Sua empresa e o escritório de contabilidade no mesmo lugar, direto no celular.
```

**Descrição completa (até 4.000):**

```
O Portal 41 é o portal do cliente dos escritórios que usam a plataforma Connect. Com ele, você acompanha a sua empresa junto com o escritório de contabilidade, sem depender de e-mail ou de troca de mensagens soltas.

O que você faz no Portal 41:

• Pendências: veja o que o escritório precisa de você, responda e envie os documentos pedidos, com prazo e histórico.
• Aprovações: aprove ou reprove pagamentos antes da baixa, dentro dos limites combinados com o escritório.
• Contas a pagar e a receber: acompanhe vencimentos, títulos em aberto e o que já foi pago.
• Relatórios: DRE, fluxo de caixa e outros demonstrativos da sua empresa.
• Processos societários: acompanhe aberturas, alterações e baixas etapa por etapa, veja o que o órgão exigiu, converse com a equipe e envie documentos dentro de cada processo.
• Conversa com o escritório: mande mensagens e arquivos a qualquer momento.
• Avisos no celular: receba uma notificação quando houver pendência nova, mensagem ou pagamento para aprovar.

Privacidade em primeiro lugar: as notificações e os e-mails dizem apenas que há algo novo. Valores, documentos e o conteúdo das mensagens ficam dentro do portal, atrás do seu login.

O acesso ao Portal 41 é liberado pelo escritório de contabilidade que atende a sua empresa. Se você ainda não tem login, fale com o seu escritório.
```

**Recursos gráficos** (nesta pasta):

| Item | Arquivo | Exigência do Play |
|---|---|---|
| Ícone | `icon-512.png` | 512×512, PNG 32 bits |
| Recurso gráfico | `feature-graphic.png` (fonte: `feature-graphic.svg`) | 1024×500 |
| Capturas de celular | **falta — ver abaixo** | mín. 2, 9:16, lados entre 320 e 3.840 px |

**Capturas de tela** — precisam do portal logado com dados, e login com senha
é do Kauan. Jeito mais rápido: no Chrome do PC, entrar no portal com o acesso
de revisão (seção 4), apertar F12 → ícone de celular (Ctrl+Shift+M) → escolher
um aparelho 9:16 (ex.: Pixel 7, 412×915) → menu ⋮ da barra de dispositivo →
"Capture screenshot". Sugestão de 4 telas: início do portal, pendências,
aprovações e um processo societário. Nenhuma pode mostrar dado de cliente real —
usar só a empresa `[demo]`.

## 3. Categoria e contato

| Campo | Valor |
|---|---|
| Categoria | Empresas (Business) |
| Tags | Contabilidade, Finanças empresariais |
| E-mail | `marcos@41contabil.com.br` |
| Site | `https://41contabil.com.br` |
| Política de privacidade | `https://appteste.useconnect.com.br/portal/privacidade` |

A política é a página `src/app/(portal)/portal/privacidade/page.tsx`, pública
(sem login). Se o endereço definitivo do portal mudar, a URL muda junto.

## 4. Conteúdo do app (Política do app)

**Acesso ao app** → "Todas ou algumas funcionalidades são restritas" →
informar um login do portal para o revisor. Como criar:
1. `/admin/portal` → criar acesso no grupo de cliente `[demo]` (dados de
   `scripts/dados-de-demonstracao.ts`) com um e-mail **que alguém da 41 lê** —
   o do usuário `[demo]` que já existe é `@exemplo.invalido` e não recebe o link
   de senha.
2. Definir a senha pelo link e colar e-mail e senha só no Play Console.
3. **Não rodar `dados-de-demonstracao.ts --limpar` enquanto o app estiver em
   revisão** — ele apaga esse acesso e o revisor encontra o portal vazio.

**Anúncios:** Não, o app não contém anúncios.

**Classificação de conteúdo** (questionário IARC): categoria "Todos os outros
tipos de app"; responder **Não** a violência, sexo, linguagem, drogas, jogos de
azar e compras. O app **não** permite interação livre entre usuários
desconhecidos (a conversa é só entre o cliente e o escritório). Resultado
esperado: Livre / 3+.

**Público-alvo:** 18 anos ou mais. Não é direcionado a crianças.

**Apps de notícias:** Não. **App governamental:** Não.

**Recursos financeiros:** o app mostra informação financeira da própria empresa
e registra aprovação de pagamento, mas **não** movimenta dinheiro, não empresta,
não faz pagamento nem investimento. Marcar que não oferece nenhum dos recursos
financeiros listados; se o formulário tiver opção de gestão financeira/contábil
empresarial, marcar essa.

**Saúde:** Não. **Declaração de ID de publicidade:** o app **não** usa ID de
publicidade.

### Segurança dos dados

- Coleta ou compartilha dados? **Sim** (coleta).
- Criptografados em trânsito? **Sim** (HTTPS).
- Oferece forma de pedir exclusão? **Sim** — pelo e-mail da política
  (seção "Seus direitos e exclusão da conta").
- Compartilhamento com terceiros: **Não** — hospedagem, e-mail, notificações e
  IA são operadores agindo em nome do escritório, o que o Google não conta
  como compartilhamento.

| Tipo de dado (Play) | Coletado | Obrigatório? | Finalidade |
|---|---|---|---|
| Informações pessoais → Nome | Sim | Obrigatório | Funcionalidade do app; Gerenciamento da conta |
| Informações pessoais → Endereço de e-mail | Sim | Obrigatório | Funcionalidade do app; Gerenciamento da conta; Comunicações do desenvolvedor |
| Informações financeiras → Outras informações financeiras | Sim | Obrigatório | Funcionalidade do app |
| Mensagens → Outras mensagens no app | Sim | Opcional | Funcionalidade do app |
| Arquivos e documentos | Sim | Opcional | Funcionalidade do app |
| IDs do dispositivo ou outros IDs | Sim | Opcional (só ao ativar avisos) | Funcionalidade do app (notificações) |

Não coletados: localização, contatos, fotos e vídeos (fora do que o usuário
anexa como arquivo), áudio, saúde, histórico de navegação, atividade no app
para analytics, diagnóstico de falhas.

## 5. Versão

- Trilha: **Produção** (conta de organização não precisa passar pelo teste
  fechado).
- Arquivo: `../app-release-bundle.aab` — gerar de novo com `bubblewrap build`
  se `twa-manifest.json` mudar (subir `appVersionCode` a cada envio).
- **Assinatura do Google Play:** aceitar o "Play App Signing". O Google
  re-assina o app com uma chave dele — e o `assetlinks.json` precisa conhecer
  essa chave também, senão o app abre com a barra de endereço do Chrome no
  topo:
  1. Play Console → Testar e lançar → Configuração → **Integridade do app** →
     "Certificado da chave de assinatura do app" → copiar o **SHA-256**.
  2. No EasyPanel, na variável `ANDROID_CERT_FINGERPRINTS`, **acrescentar**
     esse SHA-256 ao que já está lá, separado por vírgula (os dois convivem — o
     da nossa keystore segue valendo para o APK de fora da loja). Reiniciar o
     serviço para a variável valer.
  3. Conferir: `https://appteste.useconnect.com.br/.well-known/assetlinks.json`
     deve listar os dois.

## Decisão em aberto

O app aponta para `appteste.useconnect.com.br` (`twa-manifest.json`: `host`).
Trocar de endereço depois exige nova versão na loja; o nome do pacote
(`br.com.useconnect.portal`) **não muda nunca** depois de publicado.
