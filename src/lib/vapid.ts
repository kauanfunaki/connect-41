// Chave pública VAPID lida em RUNTIME, não em tempo de build.
//
// Antes o client component lia `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`
// direto. Variável `NEXT_PUBLIC_*` é inlinada no bundle durante `next build`,
// e o build acontece dentro do `docker build` (ver Dockerfile), onde as env
// vars do EasyPanel NÃO existem — elas são injetadas só no container em
// runtime. Resultado: a chave virava `undefined` no código enviado ao
// navegador e o push ficava "indisponível" para sempre, por mais rebuilds que
// se fizesse.
//
// A chave pública é pública por definição (vai para o navegador como
// applicationServerKey), então não há problema em servi-la a partir de um
// Server Component como prop. Assim basta definir a env var e reiniciar — sem
// rebuild, sem build arg no Docker.
export function getVapidPublicKey(): string | null {
  return (
    process.env.VAPID_PUBLIC_KEY ||
    // Compatibilidade: se alguém já tiver configurado só a variante NEXT_PUBLIC_
    // (e ela tiver chegado ao build), continua funcionando.
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    null
  );
}
