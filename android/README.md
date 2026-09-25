# App Android do Portal do Cliente

Um **TWA** — Trusted Web Activity. Não é um app reescrito: é o portal que já
existe, embrulhado num app Android que abre em tela cheia, com ícone próprio e
sem barra de endereço. O que roda dentro é o mesmo site, então **toda mudança no
Connect chega ao app sem republicar nada**.

Serve para instalar por download direto (mandar o `.apk` por link ou WhatsApp).
Não precisa de conta de loja, dos US$ 25 do Google, nem do D-U-N-S — essas
exigências são para publicar na Play Store, que é outro passo.

## Antes de começar

| O que | Onde |
|---|---|
| Node 18+ | já tem |
| JDK 17 | `winget install Microsoft.OpenJDK.17` |
| Android SDK | o Bubblewrap baixa sozinho na primeira execução, e pergunta onde pôr |

```bash
npm install -g @bubblewrap/cli
```

## 1. Gerar a chave de assinatura

**Este passo é seu, não do Claude.** A senha da keystore é um segredo, e um
segredo que se perde é definitivo: **sem esta chave não dá para atualizar o app
nunca mais** — o Android recusa uma versão nova assinada por outra chave. Quem
instalou teria de desinstalar e instalar de novo, perdendo o que estava dentro.

```bash
keytool -genkeypair -v -keystore android/android.keystore -alias portal41 -keyalg RSA -keysize 2048 -validity 10000
```

Guarde no mesmo lugar em que ficarão as senhas dos certificados digitais — é o
mesmo tipo de segredo, e a mesma regra: **nunca no banco do Connect, nunca no
vault, nunca em chat**.

O arquivo `android.keystore` **não entra no git**. Confira que o `.gitignore`
está pegando ele antes de commitar qualquer coisa desta pasta.

## 2. Pegar o fingerprint e pôr no ar

```bash
keytool -list -v -keystore android/android.keystore -alias portal41 | findstr SHA256
```

Sai algo como `SHA256: AB:CD:EF:...`. Copie **só o valor**, com os dois-pontos.

No EasyPanel, no serviço do Connect, crie:

```
ANDROID_CERT_FINGERPRINTS=AB:CD:EF:...
```

E reinicie o serviço. **Não precisa rebuildar**: a rota lê a variável em tempo
de execução, pelo mesmo motivo do `VAPID_PUBLIC_KEY` (ver `src/lib/vapid.ts`).

Confira que ficou de pé:

```bash
curl https://appteste.useconnect.com.br/.well-known/assetlinks.json
```

Tem de vir um array com o seu fingerprint dentro. **Array vazio significa que a
variável não chegou** — e o app vai abrir com a barra do Chrome no topo.

> Se um dia o app for para a Play Store, o Google **re-assina** com uma chave
> dele, e o fingerprint publicado passa a ser outro. A variável aceita lista
> separada por vírgula justamente para os dois conviverem.

## 3. Gerar o app

```bash
cd android
bubblewrap init --manifest=https://appteste.useconnect.com.br/portal/manifest.webmanifest
bubblewrap build
```

O `init` faz perguntas; as respostas já estão em `twa-manifest.json`, e ele usa
o arquivo se você mandar sobrescrever com os valores de lá. Sai um
`app-release-signed.apk` — é esse que se manda para instalar.

Para instalar num celular ligado por USB:

```bash
bubblewrap install
```

## Decisões que ficaram em aberto

**O host.** O manifesto aponta para `appteste.useconnect.com.br`, que é o
endereço de hoje. O TWA amarra o app a **uma origem**: trocar o domínio depois
exige um app novo, com o assetlinks no domínio novo. Vale decidir o endereço
definitivo do portal antes de mandar o APK para alguém de fora.

**O nome do pacote.** `br.com.useconnect.portal` é o identificador do app no
Android, e **não muda depois de publicado**. Se a ideia for um app por cliente,
ele muda por cliente, e isso é o desenho que o Marcos precisa decidir.

## O que você ganha, e o que não ganha

**Ganha:** ícone na tela, tela cheia sem barra de endereço, o app na lista de
compartilhamento do Android, e as notificações push que o portal já manda.

**Não ganha:** nada de offline além do que o portal já faz, nem acesso a câmera
ou arquivos além do que o navegador dá. TWA é o site, com moldura de app.

**iOS não entra aqui.** TWA é do Android. No iPhone, o caminho continua sendo
"Adicionar à Tela de Início" pelo Safari — que já funciona, e é onde o push do
iOS passa a valer. Um app de verdade na App Store precisa de Capacitor, dos
US$ 99/ano e das decisões do Marcos.

## Publicação na Google Play

Ficha da loja, textos, imagens e roteiro do Play Console em [`play-store/README.md`](play-store/README.md).
