// Envio de arquivo com progresso.
//
// Usa `XMLHttpRequest` e não `fetch` por um motivo só: **fetch não expõe
// progresso de upload**. Não existe evento de bytes enviados na API — o
// `ReadableStream` de request resolveria, mas ainda não é suportado de forma
// utilizável nos navegadores que este app atende. Sem XHR, a barra das telas de
// upload seria decorativa, indo de 0 a 100 sem relação com o que acontece.

export type RespostaUpload = { ok: true; body: unknown } | { ok: false; erro: string };

/**
 * Envia um `FormData` para `url`, chamando `onProgresso` conforme os bytes
 * saem. O progresso é 0–100 e só é reportado quando o total é conhecido.
 *
 * Devolve o erro em vez de lançar: toda tela que sobe arquivo precisa mostrar a
 * falha ao lado do arquivo, e `try/catch` espalhado por cada uma seria pior.
 */
export function uploadComProgresso(
  url: string,
  form: FormData,
  onProgresso: (percentual: number) => void
): Promise<RespostaUpload> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.addEventListener("progress", (e) => {
      // `lengthComputable` é falso quando o servidor usa chunked encoding; aí
      // não há total e qualquer percentual seria inventado.
      if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        // 100% no load, não no último evento de progresso: o `progress` termina
        // quando os bytes saem do cliente, mas o servidor ainda está gravando —
        // marcar concluído antes seria mentira, e o arquivo pode falhar ali.
        onProgresso(100);
        resolve({ ok: true, body });
        return;
      }
      const erro =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `Erro ${xhr.status} ao enviar.`;
      resolve({ ok: false, erro });
    });

    xhr.addEventListener("error", () => resolve({ ok: false, erro: "Falha de rede ao enviar." }));
    xhr.addEventListener("abort", () => resolve({ ok: false, erro: "Envio cancelado." }));

    xhr.send(form);
  });
}
