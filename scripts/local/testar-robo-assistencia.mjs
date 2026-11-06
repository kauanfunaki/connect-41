// Ponta a ponta da sessão assistida do robô (06/11/2026), sem a prefeitura e sem o Connect:
// um Chrome sem janela abre uma página local com um "Não sou um robô" dentro de um iframe (como
// o ICI Captcha), e um Connect de mentira recebe os quadros e devolve um clique. Roda a mesma
// `ajudaPeloConnect` que o robô usa.
//   node scripts/local/testar-robo-assistencia.mjs
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { ajudaPeloConnect } from "../robo-assistencia.mjs";

const TAREFA = { id: "0b6f3c1e-8d2a-4c6b-9f1e-2a3b4c5d6e7f" };
const PAGINA = `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:sans-serif">
  <h1 style="margin:24px">Consulta fictícia</h1>
  <iframe id="captcha" style="position:absolute;left:400px;top:300px;width:300px;height:80px;border:1px solid #999"
    srcdoc="<label style='display:block;padding:24px'><input id='c' type='checkbox' style='width:24px;height:24px' onchange='parent.postMessage(this.checked,&quot;*&quot;)'> Não sou um robô</label>"></iframe>
  <button id="consultar" disabled style="position:absolute;left:400px;top:420px">Consultar</button>
  <script>addEventListener("message", (e) => { document.getElementById("consultar").disabled = !e.data; });</script>
</body>`;

/** Um Connect de mentira: abre a sessão, guarda os quadros e devolve o clique depois do segundo quadro. */
function connectDeMentira({ aguardar = true, prazoMs = 20_000, clique = null }) {
  const visto = { quadros: [], fim: null, pedidos: 0 };
  const server = createServer((req, res) => {
    const corpo = [];
    req.on("data", (c) => corpo.push(c));
    req.on("end", () => {
      const base = `/api/ops/watchers/robo-teste/tarefas/${TAREFA.id}`;
      const json = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== "Bearer ops_teste") { res.writeHead(401); return res.end(); }
      if (req.method === "POST" && req.url === `${base}/assistencia`) {
        visto.pedidos++;
        return json(aguardar ? { aguardar: true, prazoMs, ate: new Date(Date.now() + prazoMs).toISOString() } : { aguardar: false, motivo: "fora_do_horario" });
      }
      if (req.method === "PUT" && req.url === `${base}/tela`) {
        visto.quadros.push({ tipo: req.headers["content-type"], bytes: Buffer.concat(corpo) });
        return json({ encerrar: false, cliques: clique && visto.quadros.length === 2 ? [clique] : [] });
      }
      if (req.method === "POST" && req.url === `${base}/assistencia/fim`) {
        visto.fim = JSON.parse(Buffer.concat(corpo).toString()).resultado;
        return json({ ok: true });
      }
      res.writeHead(404);
      res.end();
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, visto, baseUrl: `http://127.0.0.1:${server.address().port}` })));
}

const navegador = await chromium.launch();
async function cenario(nome, opcoes) {
  const fake = await connectDeMentira(opcoes);
  const page = await (await navegador.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.setContent(PAGINA);
  const consultar = page.locator("#consultar");
  const linhas = [];
  try {
    const fim = await ajudaPeloConnect({
      config: { baseUrl: fake.baseUrl, slug: "robo-teste", token: "ops_teste" },
      tarefa: TAREFA,
      page,
      liberado: () => consultar.isEnabled().catch(() => false),
      log: (l) => linhas.push(l),
    });
    return { fim, visto: fake.visto, liberado: await consultar.isEnabled(), linhas };
  } finally {
    await page.context().close();
    fake.server.close();
  }
}

// 1) Alguém clica na caixa: o clique cai dentro do iframe, o Consultar libera, o fim vai como "resolvido".
//    A caixa está em (400+1+24+12, 300+1+24+12) ≈ (437, 337) numa janela de 1280×720.
const r1 = await cenario("resolvido", { clique: { x: 437 / 1280, y: 337 / 720 } });
assert.equal(r1.fim, "resolvido", r1.linhas.join("\n"));
assert.equal(r1.liberado, true);
assert.equal(r1.visto.fim, "resolvido");
assert.ok(r1.visto.quadros.length >= 2, "a tela foi ao Connect");
for (const q of r1.visto.quadros) {
  assert.equal(q.tipo, "image/jpeg");
  assert.deepEqual([...q.bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], "o quadro é JPEG");
}
console.log(`ok resolvido: ${r1.visto.quadros.length} quadros, ${Math.round(r1.visto.quadros[0].bytes.length / 1024)} KB o primeiro; ${r1.linhas.find((l) => l.includes("clique"))}`);

// 2) Fora do horário: nem abre o screencast.
const r2 = await cenario("fora", { aguardar: false });
assert.equal(r2.fim, "fora_do_horario");
assert.equal(r2.visto.quadros.length, 0);
assert.equal(r2.visto.fim, null);
console.log("ok fora do horário: nenhum quadro, segue para o PDF");

// 3) Ninguém clica: termina no prazo, e o fim vai como "prazo".
const r3 = await cenario("prazo", { prazoMs: 3_000 });
assert.equal(r3.fim, "prazo");
assert.equal(r3.liberado, false);
assert.equal(r3.visto.fim, "prazo");
assert.ok(r3.visto.quadros.length >= 2, "com a tela parada, o quadro vai de novo (é nessa ida que o clique voltaria)");
console.log(`ok prazo: ${r3.visto.quadros.length} quadros em 3 s com a tela parada`);

await navegador.close();
console.log("tudo ok");
