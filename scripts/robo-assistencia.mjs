// A sessão assistida do robô do Societário (06/11/2026), no lado da máquina.
//
// O robô parou num captcha. Ele pede ajuda ao Connect; no horário comercial o
// Chrome manda a tela pelo protocolo de depuração (screencast em JPEG), o robô
// repassa o quadro mais novo ao Connect e recebe os cliques da pessoa, em
// fração do quadro, que vira coordenada da janela aqui. Só clique: nada de
// tecla chega por este caminho. Certificado e senha não passam por aqui.
//
// Em arquivo próprio para o teste de ponta a ponta rodar a mesma função com um
// Connect de mentira e uma página local, sem a prefeitura
// (scripts/local/testar-robo-assistencia.mjs).

/** De quanto em quanto tempo a tela vai ao Connect. */
const INTERVALO_DA_TELA_MS = 700;
/** Com a tela parada, o mesmo quadro vai de novo a cada tanto: é nessa ida que os cliques voltam. */
const REENVIO_DA_TELA_MS = 1_400;
/** Teto da espera, mesmo que o Connect responda com mais (o prazo da tarefa na máquina é 20 min). */
const ESPERA_MAXIMA_DA_AJUDA_MS = 12 * 60_000;

const urlDaTarefa = (config, tarefa, resto) =>
  `${config.baseUrl}/api/ops/watchers/${encodeURIComponent(config.slug)}/tarefas/${tarefa.id}/${resto}`;

/**
 * Pede ajuda. Devolve `{ aguardar, prazoMs }`, ou `null` quando o Connect não
 * tem a sessão assistida (versão anterior, ou fora do ar).
 */
async function pedirAjuda(config, tarefa, log) {
  try {
    const r = await fetch(urlDaTarefa(config, tarefa, "assistencia"), {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ motivo: "captcha" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return await r.json();
    log(`tarefa ${tarefa.id}: o Connect não abriu a sessão assistida (HTTP ${r.status} ${(await r.text()).slice(0, 160)}).`);
  } catch (err) {
    log(`tarefa ${tarefa.id}: o Connect não abriu a sessão assistida (${String(err?.message || err).slice(0, 160)}).`);
  }
  return null;
}

/** Manda um quadro e leva de volta os cliques; `null` quando a ida falhou (a próxima tenta de novo). */
async function mandarTela(config, tarefa, jpeg, log) {
  try {
    const r = await fetch(urlDaTarefa(config, tarefa, "tela"), {
      method: "PUT",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "image/jpeg", "content-length": String(jpeg.length) },
      body: jpeg,
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return await r.json();
    log(`tarefa ${tarefa.id}: a tela não chegou ao Connect (HTTP ${r.status}).`);
  } catch (err) {
    log(`tarefa ${tarefa.id}: a tela não chegou ao Connect (${String(err?.message || err).slice(0, 120)}).`);
  }
  return null;
}

async function encerrarAjuda(config, tarefa, resultado, log) {
  try {
    await fetch(urlDaTarefa(config, tarefa, "assistencia/fim"), {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ resultado }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    log(`tarefa ${tarefa.id}: o fim da sessão assistida não chegou ao Connect (${String(err?.message || err).slice(0, 120)}).`);
  }
}

/** A fração do quadro vira pixel da janela, dentro dela (a mesma conta de `cliqueNaJanela` em src/lib/robo/assistencia.ts). */
export function cliqueNaJanela(c, janela) {
  const limitar = (v, max) => Math.min(Math.max(0, Math.round(v)), Math.max(0, max - 1));
  return { x: limitar(c.x * janela.width, janela.width), y: limitar(c.y * janela.height, janela.height) };
}

/**
 * Espera alguém resolver pelo Connect. Devolve como terminou:
 * - `sem_connect`: o Connect não abriu a sessão — quem chamou espera na máquina, como antes;
 * - `fora_do_horario`: não espera; a tarefa segue para o caminho do PDF;
 * - `resolvido`, `prazo` ou `desistiu`: o que também vai ao Connect no fim.
 */
export async function ajudaPeloConnect({ config, tarefa, page, liberado, log }) {
  const ajuda = await pedirAjuda(config, tarefa, log);
  if (!ajuda) return "sem_connect";
  if (ajuda.aguardar === false) {
    log(`tarefa ${tarefa.id}: "Não sou um robô" fora do horário comercial; segue para o caminho do PDF.`);
    return "fora_do_horario";
  }
  log(`tarefa ${tarefa.id}: "Não sou um robô"; a tela foi para o Connect, e quem pediu foi avisado (até ${ajuda.ate}).`);
  const cdp = await page.context().newCDPSession(page);
  let ultimo = null;
  cdp.on("Page.screencastFrame", (f) => {
    ultimo = f.data;
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 1024 });
  let resultado = "prazo";
  let enviado = null;
  let enviadoEm = 0;
  try {
    const fim = Date.now() + Math.min(Number(ajuda.prazoMs) || 0, ESPERA_MAXIMA_DA_AJUDA_MS);
    while (Date.now() < fim) {
      if (page.isClosed()) {
        resultado = "desistiu";
        throw new Error("Target page, context or browser has been closed");
      }
      if (await liberado()) {
        resultado = "resolvido";
        break;
      }
      const novo = ultimo && ultimo !== enviado;
      if (novo || Date.now() - enviadoEm >= REENVIO_DA_TELA_MS) {
        // Quadro novo do screencast; sem ele, uma captura da janela. A captura
        // força o Chrome a desenhar mesmo com a janela coberta ou a tela da
        // máquina bloqueada, quando o screencast pode parar de mandar quadros.
        let jpeg = null;
        if (novo) {
          jpeg = Buffer.from(ultimo, "base64");
          enviado = ultimo;
        } else {
          jpeg = await page.screenshot({ type: "jpeg", quality: 60 }).catch(() => (ultimo ? Buffer.from(ultimo, "base64") : null));
        }
        if (!jpeg) {
          await page.waitForTimeout(INTERVALO_DA_TELA_MS);
          continue;
        }
        enviadoEm = Date.now();
        const resposta = await mandarTela(config, tarefa, jpeg, log);
        if (resposta?.encerrar) break;
        const janela = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
        for (const c of resposta?.cliques ?? []) {
          const { x, y } = cliqueNaJanela(c, janela);
          await page.mouse.click(x, y);
          log(`tarefa ${tarefa.id}: clique de quem ajudou em ${x},${y}.`);
          await page.waitForTimeout(250);
        }
      }
      await page.waitForTimeout(INTERVALO_DA_TELA_MS);
    }
    // Liberou no último instante, entre a última volta e o fim do prazo.
    if (resultado === "prazo" && (await liberado())) resultado = "resolvido";
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => {});
    await cdp.detach().catch(() => {});
    await encerrarAjuda(config, tarefa, resultado, log);
  }
  return resultado;
}
