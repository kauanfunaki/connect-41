import { describe, expect, it } from "vitest";
import { lerOfx, dataDoOfx, centavosDoOfx, decodificarOfx } from "./ofx";

/** Texto para bytes latin1 — o que o internet banking brasileiro entrega. */
function latin1(texto: string): Uint8Array {
  return Uint8Array.from(texto, (c) => {
    const code = c.charCodeAt(0);
    if (code > 0xff) throw new Error("fora do latin1");
    return code;
  });
}

const utf8 = (texto: string) => new TextEncoder().encode(texto);

const SGML = [
  "OFXHEADER:100",
  "DATA:OFXSGML",
  "VERSION:102",
  "SECURITY:NONE",
  "ENCODING:USASCII",
  "CHARSET:1252",
  "COMPRESSION:NONE",
  "OLDFILEUID:NONE",
  "NEWFILEUID:NONE",
  "",
  "<OFX>",
  "<SIGNONMSGSRSV1>",
  "<SONRS>",
  "<STATUS>",
  "<CODE>0",
  "<SEVERITY>INFO",
  "</STATUS>",
  "<DTSERVER>20260915120000[-3:BRT]",
  "<LANGUAGE>POR",
  "</SONRS>",
  "</SIGNONMSGSRSV1>",
  "<BANKMSGSRSV1>",
  "<STMTTRNRS>",
  "<TRNUID>1",
  "<STMTRS>",
  "<CURDEF>BRL",
  "<BANKACCTFROM>",
  "<BANKID>0341",
  "<BRANCHID>1234",
  "<ACCTID>00123456",
  "<ACCTTYPE>CHECKING",
  "</BANKACCTFROM>",
  "<BANKTRANLIST>",
  "<DTSTART>20260901000000[-3:BRT]",
  "<DTEND>20260915000000[-3:BRT]",
  "<STMTTRN>",
  "<TRNTYPE>DEBIT",
  "<DTPOSTED>20260905000000[-3:BRT]",
  "<TRNAMT>-1234.56",
  "<FITID>202609050001",
  "<CHECKNUM>000123",
  "<MEMO>TARIFA MANUTENÇÃO CONTA",
  "</STMTTRN>",
  "<STMTTRN>",
  "<TRNTYPE>CREDIT",
  "<DTPOSTED>20260910",
  "<TRNAMT>2500,00",
  "<FITID>202609100002",
  "<MEMO>",
  "<NAME>JOSÉ DA SILVA &amp; FILHOS",
  "</STMTTRN>",
  "</BANKTRANLIST>",
  "<LEDGERBAL>",
  "<BALAMT>10265.44",
  "<DTASOF>20260915000000[-3:BRT]",
  "</LEDGERBAL>",
  "</STMTRS>",
  "</STMTTRNRS>",
  "</BANKMSGSRSV1>",
  "</OFX>",
].join("\r\n");

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="220" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>BRL</CURDEF>
        <BANKACCTFROM>
          <BANKID>001</BANKID>
          <ACCTID>98765-4</ACCTID>
          <ACCTTYPE>SAVINGS</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>20260801</DTSTART>
          <DTEND>20260831</DTEND>
          <STMTTRN>
            <TRNTYPE>PAYMENT</TRNTYPE>
            <DTPOSTED>20260820120000.000[-3:BRT]</DTPOSTED>
            <TRNAMT>350.00</TRNAMT>
            <FITID>ABC-1</FITID>
            <NAME>ENERGIA ELÉTRICA SÃO PAULO</NAME>
            <MEMO></MEMO>
          </STMTTRN>
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>-50.10</BALAMT>
          <DTASOF>20260831</DTASOF>
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

function semFitId(transacoes: string[]): string {
  return [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "CHARSET:1252",
    "",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>",
    "<BANKACCTFROM><BANKID>237<ACCTID>55555-5</BANKACCTFROM>",
    "<BANKTRANLIST>",
    ...transacoes,
    "</BANKTRANLIST>",
    "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");
}

const tarifa = "<STMTTRN><TRNTYPE>FEE<DTPOSTED>20260903<TRNAMT>-9.90<MEMO>TARIFA PIX</STMTTRN>";
const outra = "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260904<TRNAMT>-15.00<MEMO>TARIFA TED</STMTTRN>";

describe("lerOfx — SGML 1.x em latin1", () => {
  const r = lerOfx(latin1(SGML));

  it("lê a conta, o período e o saldo", () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.extrato.bancoId).toBe("0341");
    expect(r.extrato.agencia).toBe("1234");
    expect(r.extrato.contaId).toBe("00123456");
    expect(r.extrato.tipoDaConta).toBe("CHECKING");
    expect(r.extrato.inicioKey).toBe("2026-09-01");
    expect(r.extrato.fimKey).toBe("2026-09-15");
    expect(r.extrato.saldo).toEqual({ centavos: 1_026_544, dataKey: "2026-09-15" });
    expect(r.extrato.charset).toBe("windows-1252");
  });

  it("decodifica o acento do MEMO e as entidades", () => {
    if (!r.ok) throw new Error(r.erro);
    expect(r.extrato.transacoes[0]!.memo).toBe("TARIFA MANUTENÇÃO CONTA");
    expect(r.extrato.transacoes[1]!.nome).toBe("JOSÉ DA SILVA & FILHOS");
  });

  it("lê valor com ponto e com vírgula, com sinal, e o CHECKNUM", () => {
    if (!r.ok) throw new Error(r.erro);
    const [debito, credito] = r.extrato.transacoes;
    expect(debito).toMatchObject({ fitId: "202609050001", dataKey: "2026-09-05", centavos: -123_456, tipo: "DEBIT", cheque: "000123" });
    expect(credito).toMatchObject({ fitId: "202609100002", dataKey: "2026-09-10", centavos: 250_000, fitIdGerado: false });
  });

  it("MEMO vazio do SGML não engole os campos seguintes", () => {
    if (!r.ok) throw new Error(r.erro);
    expect(r.extrato.transacoes[1]!.memo).toBeNull();
    expect(r.extrato.transacoes).toHaveLength(2);
  });

  it("o mesmo arquivo em UTF-8, apesar do CHARSET:1252, lê o acento certo", () => {
    const u = lerOfx(utf8(SGML));
    if (!u.ok) throw new Error(u.erro);
    expect(u.extrato.charset).toBe("utf-8");
    expect(u.extrato.transacoes[0]!.memo).toBe("TARIFA MANUTENÇÃO CONTA");
  });
});

describe("lerOfx — XML 2.x", () => {
  const r = lerOfx(utf8(XML));

  it("lê conta, transação e saldo negativo", () => {
    if (!r.ok) throw new Error(r.erro);
    expect(r.extrato.contaId).toBe("98765-4");
    expect(r.extrato.tipoDaConta).toBe("SAVINGS");
    expect(r.extrato.inicioKey).toBe("2026-08-01");
    expect(r.extrato.saldo).toEqual({ centavos: -5_010, dataKey: "2026-08-31" });
    expect(r.extrato.transacoes).toHaveLength(1);
    expect(r.extrato.transacoes[0]!.nome).toBe("ENERGIA ELÉTRICA SÃO PAULO");
    expect(r.extrato.transacoes[0]!.memo).toBeNull();
  });

  it("PAYMENT com valor positivo vira débito", () => {
    if (!r.ok) throw new Error(r.erro);
    expect(r.extrato.transacoes[0]!.centavos).toBe(-35_000);
  });
});

describe("lerOfx — sem FITID", () => {
  it("gera id determinístico e igual numa reimportação", () => {
    const a = lerOfx(latin1(semFitId([tarifa, outra])));
    const b = lerOfx(latin1(semFitId([tarifa, outra])));
    if (!a.ok || !b.ok) throw new Error("falhou");
    expect(a.extrato.transacoes[0]!.fitIdGerado).toBe(true);
    expect(a.extrato.transacoes[0]!.fitId).toMatch(/^GERADO-[0-9a-f]{40}$/);
    expect(a.extrato.transacoes.map((t) => t.fitId)).toEqual(b.extrato.transacoes.map((t) => t.fitId));
  });

  it("duas transações idênticas no mesmo arquivo recebem ids diferentes", () => {
    const r = lerOfx(latin1(semFitId([tarifa, tarifa])));
    if (!r.ok) throw new Error(r.erro);
    const [x, y] = r.extrato.transacoes;
    expect(x!.fitId).not.toBe(y!.fitId);
  });

  it("período sobreposto: a mesma transação em outra posição mantém o id", () => {
    const sozinha = lerOfx(latin1(semFitId([tarifa])));
    const depois = lerOfx(latin1(semFitId([outra, tarifa])));
    if (!sozinha.ok || !depois.ok) throw new Error("falhou");
    expect(depois.extrato.transacoes[1]!.fitId).toBe(sozinha.extrato.transacoes[0]!.fitId);
  });

  it("FITID repetido no mesmo arquivo ganha sufixo", () => {
    const repetido = "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260903<TRNAMT>-1.00<FITID>X1<MEMO>A</STMTTRN>";
    const r = lerOfx(latin1(semFitId([repetido, repetido.replace("-1.00", "-2.00")])));
    if (!r.ok) throw new Error(r.erro);
    expect(r.extrato.transacoes.map((t) => t.fitId)).toEqual(["X1", "X1#2"]);
  });
});

describe("lerOfx — recusas", () => {
  it("arquivo lixo devolve erro legível, sem lançar", () => {
    const r = lerOfx(utf8("isto não é um extrato\nnem de longe"));
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("não é um extrato OFX") });
  });

  it("arquivo vazio", () => {
    expect(lerOfx(new Uint8Array()).ok).toBe(false);
  });

  it("binário qualquer não lança", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(lerOfx(bytes).ok).toBe(false);
  });

  it("valor ilegível diz qual transação", () => {
    const r = lerOfx(latin1(semFitId([tarifa, tarifa.replace("-9.90", "abc")])));
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("Transação 2") });
  });

  it("sem BANKACCTFROM", () => {
    const r = lerOfx(utf8("<OFX><BANKTRANLIST></BANKTRANLIST></OFX>"));
    expect(r.ok).toBe(false);
  });

  it("extrato de cartão é recusado com o motivo", () => {
    const r = lerOfx(utf8("<OFX><CCSTMTRS><CCACCTFROM><ACCTID>1</CCACCTFROM></CCSTMTRS></OFX>"));
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("cartão") });
  });

  it("duas contas no mesmo arquivo", () => {
    const r = lerOfx(
      utf8("<OFX><BANKACCTFROM><ACCTID>1111</BANKACCTFROM><BANKACCTFROM><ACCTID>2222</BANKACCTFROM></OFX>")
    );
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("mais de uma conta") });
  });

  it("transação de valor zero é descartada e contada", () => {
    const r = lerOfx(latin1(semFitId([tarifa, tarifa.replace("-9.90", "0.00")])));
    if (!r.ok) throw new Error(r.erro);
    expect(r.extrato.transacoes).toHaveLength(1);
    expect(r.extrato.zeradas).toBe(1);
  });
});

describe("valores e datas do OFX", () => {
  it("datas", () => {
    expect(dataDoOfx("20260910000000[-3:BRT]")).toBe("2026-09-10");
    expect(dataDoOfx("20260910235959.123[-3:BRT]")).toBe("2026-09-10");
    expect(dataDoOfx("20260910")).toBe("2026-09-10");
    expect(dataDoOfx("20260231")).toBeNull();
    expect(dataDoOfx("")).toBeNull();
  });

  it("valores", () => {
    expect(centavosDoOfx("-150.00")).toBe(-15_000);
    expect(centavosDoOfx("150,5")).toBe(15_050);
    expect(centavosDoOfx("1.234,56")).toBe(123_456);
    expect(centavosDoOfx("1,234.56")).toBe(123_456);
    expect(centavosDoOfx("+10")).toBe(1_000);
    expect(centavosDoOfx("-150.000")).toBe(-15_000);
    expect(centavosDoOfx("10.555")).toBeNull();
    expect(centavosDoOfx("")).toBeNull();
    expect(centavosDoOfx("R$ 10")).toBeNull();
  });

  it("decodifica pelo cabeçalho quando o arquivo é só ASCII", () => {
    expect(decodificarOfx(utf8('<?xml version="1.0" encoding="UTF-8"?><OFX>')).charset).toBe("utf-8");
    expect(decodificarOfx(utf8("OFXHEADER:100\nCHARSET:1252\n<OFX>")).charset).toBe("windows-1252");
  });
});
