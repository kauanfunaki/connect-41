// Digital Asset Links — a prova de que o app Android e este site são do mesmo dono.
//
// É o que faz o TWA (o app que embrulha o portal) abrir **sem a barra de
// endereço**. Sem este arquivo o app até roda, mas com a faixa do Chrome no
// topo mostrando a URL — e aí deixa de parecer um app, que é o ponto inteiro
// de empacotar.
//
// O Android busca isto em `https://<host>/.well-known/assetlinks.json`, sem
// sessão, no primeiro lançamento do app. Por isso a rota entra em PUBLIC_PATHS
// no proxy: um redirect para o login devolveria HTML onde o Android espera
// JSON, e a verificação falharia em silêncio.
//
// ─── Por que o fingerprint vem de env, e não do código ──────────────────────
//
// Ele é o SHA-256 do **certificado de assinatura** do app, e muda conforme
// quem assina: a chave de upload que gera o APK aqui, e a chave que o Google
// Play usa se um dia o app for publicado lá (o Play re-assina, e o fingerprint
// dele é outro). Aceitar mais de um é o normal — por isso a variável é uma
// lista separada por vírgula.
//
// Lido em RUNTIME, sem prefixo `NEXT_PUBLIC_`: o Dockerfile roda `npm run
// build` sem as variáveis do EasyPanel, e qualquer coisa inlinada no build
// chegaria vazia. Mesma lição de `VAPID_PUBLIC_KEY` — ver src/lib/vapid.ts.
//
// O fingerprint **não é segredo**: é um hash da parte pública do certificado, e
// fica exposto neste arquivo por desenho. O que é segredo é a keystore que o
// gerou, e essa não passa por aqui.

/** Identificador do app Android. Muda junto com o `packageId` do twa-manifest.json. */
const PACOTE_PADRAO = "br.com.useconnect.portal";

function fingerprints(): string[] {
  return (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => f.length > 0);
}

export function GET(): Response {
  const lista = fingerprints();
  const pacote = process.env.ANDROID_PACKAGE_NAME?.trim() || PACOTE_PADRAO;

  // Sem fingerprint configurado, devolve uma lista vazia — que é JSON válido e
  // a resposta honesta: "nenhum app está autorizado neste domínio". Devolver
  // 404 faria o Android registrar erro de rede, que é mais difícil de entender
  // do que uma lista vazia.
  const corpo =
    lista.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: pacote,
              sha256_cert_fingerprints: lista,
            },
          },
        ];

  return Response.json(corpo, {
    headers: {
      "Content-Type": "application/json",
      // O Android relê isto de tempos em tempos; cache curto para uma troca de
      // chave valer no mesmo dia.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
