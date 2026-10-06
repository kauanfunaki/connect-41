// Uma caixa de e-mail de mentira para o Connect local (06/10/2026).
//
// Sem SMTP, as telas que avisam o cliente por e-mail (pendência, resposta de
// solicitação, conversa do processo) mostram "E-mail não enviado: o SMTP deste
// workspace não está configurado" — verdade no banco local, mas aviso que não
// existe na produção e não pode aparecer nos vídeos da ajuda. O
// `preparar-ambiente.ts` aponta o SMTP do escritório local para cá
// (127.0.0.1:2525), e o `scripts/videos/gravar.ts` abre esta caixa enquanto
// grava: ela aceita tudo e joga fora. Nada sai da máquina.
//
// É o mínimo do SMTP que o nodemailer usa: EHLO com AUTH, MAIL, RCPT, DATA e
// QUIT. Sem STARTTLS, de propósito — é só local.

import net from "node:net";

export const PORTA_DO_EMAIL_LOCAL = 2525;

export async function abrirCaixaDeEmailLocal(porta = PORTA_DO_EMAIL_LOCAL) {
  let recebidos = 0;
  const abertos = new Set<net.Socket>();
  const servidor = net.createServer((socket) => {
    abertos.add(socket);
    socket.on("close", () => abertos.delete(socket));
    let lendoDados = false;
    let esperandoLogin = 0;
    let buffer = "";
    const responder = (linha: string) => socket.write(`${linha}\r\n`);
    responder("220 localhost ESMTP caixa local");
    socket.on("data", (pedaco) => {
      buffer += pedaco.toString("latin1");
      let fim: number;
      while ((fim = buffer.indexOf("\r\n")) >= 0) {
        const linha = buffer.slice(0, fim);
        buffer = buffer.slice(fim + 2);
        if (lendoDados) {
          if (linha === ".") {
            lendoDados = false;
            recebidos += 1;
            responder("250 OK: guardado em lugar nenhum");
          }
          continue;
        }
        if (esperandoLogin > 0) {
          esperandoLogin -= 1;
          responder(esperandoLogin > 0 ? "334 UGFzc3dvcmQ6" : "235 OK");
          continue;
        }
        const comando = linha.split(" ")[0].toUpperCase();
        if (comando === "EHLO") {
          responder("250-localhost");
          responder("250-AUTH PLAIN LOGIN");
          responder("250 8BITMIME");
        } else if (comando === "HELO") responder("250 localhost");
        else if (comando === "AUTH") {
          const [, tipo, inicial] = linha.split(" ");
          if (tipo?.toUpperCase() === "LOGIN") {
            esperandoLogin = inicial ? 1 : 2;
            responder(inicial ? "334 UGFzc3dvcmQ6" : "334 VXNlcm5hbWU6");
          } else if (inicial) responder("235 OK");
          else {
            esperandoLogin = 1;
            responder("334 ");
          }
        } else if (comando === "DATA") {
          lendoDados = true;
          responder("354 Pode mandar");
        } else if (comando === "QUIT") {
          responder("221 Tchau");
          socket.end();
        } else responder("250 OK");
      }
    });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolver, rejeitar) => {
    servidor.once("error", rejeitar);
    servidor.listen(porta, "127.0.0.1", () => resolver());
  });
  return {
    recebidos: () => recebidos,
    fechar: () =>
      new Promise<void>((resolver) => {
        for (const s of abertos) s.destroy();
        servidor.close(() => resolver());
      }),
  };
}
