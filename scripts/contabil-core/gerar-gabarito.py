"""Gabarito dos motores do Contábil Core, Fase 1 (09/11/2026).

Roda as funções puras do Contábil Core original (dev41tech/contabil-core, Python) sobre um conjunto
de entradas e grava cada chamada com a entrada e a saída exatas. O porte em TypeScript repete as
chamadas e tem de dar o mesmo resultado (`src/lib/contabil-core/motor/gabarito.test.ts`).

Funções que moram em arquivos que dependem de banco (`_calcular_hash` em `extrato/service.py`, o
casamento de regra em `neo/engine.py`) são extraídas do código-fonte com `ast` e executadas sozinhas:
o teste confere o original, e não uma cópia escrita à mão.

Só dados inventados: nenhum extrato, CNPJ ou nome de cliente real. Os CNPJs são fictícios ou de
exemplo com dígito qualquer — o motor não confere dígito verificador nestas funções.

Uso (Python 3.12+, sem instalar nada — só biblioteca padrão):
    python -I scripts/contabil-core/gerar-gabarito.py <raiz do contabil-core> <saída .json>
"""
import ast
import json
import sys
import types
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

raiz = Path(sys.argv[1]).resolve()
saida = Path(sys.argv[2])
sys.path.insert(0, str(raiz))

from src.core import texto  # noqa: E402
from src.domain.extrato import conferencia, ofx_parser, validacao  # noqa: E402
from src.domain.exportacao import formatos, historico  # noqa: E402
from src.domain.neo import contraparte_por_nome, documento_no_historico  # noqa: E402


def funcoes_do_fonte(arquivo: Path, nomes: set[str], contexto: dict) -> dict:
    """Executa só as funções (e métodos) pedidas de um arquivo Python, sem importar o resto."""
    arvore = ast.parse(arquivo.read_text(encoding="utf-8"))
    escolhidas: list[ast.stmt] = []
    for no in arvore.body:
        if isinstance(no, ast.FunctionDef) and no.name in nomes:
            escolhidas.append(no)
        elif isinstance(no, ast.ClassDef):
            for item in no.body:
                if isinstance(item, ast.FunctionDef) and f"{no.name}.{item.name}" in nomes:
                    # Método sem `self`/`cls` usado: vira função solta com o mesmo corpo.
                    item.decorator_list = []
                    escolhidas.append(item)
    achadas = {n.name for n in escolhidas}
    faltam = {n for n in nomes if n.split(".")[-1] not in achadas}
    if faltam:
        raise SystemExit(f"funções não encontradas em {arquivo.name}: {sorted(faltam)}")
    modulo = ast.Module(body=escolhidas, type_ignores=[])
    ns = dict(contexto)
    exec(compile(modulo, str(arquivo), "exec"), ns)
    return ns


chamadas: list[dict] = []


def codificar(v):
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        raise TypeError("float no gabarito: use Decimal")
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    if isinstance(v, date):
        return {"$date": v.isoformat()}
    if isinstance(v, bytes):
        return {"$bytes": v.hex()}
    if isinstance(v, (list, tuple)):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        return {str(k): codificar(x) for k, x in v.items()}
    if hasattr(v, "__dataclass_fields__"):
        return {k: codificar(getattr(v, k)) for k in v.__dataclass_fields__}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


def chamar(nome: str, fn, *args, **kwargs):
    registro = {"fn": nome, "args": codificar(list(args)), "kwargs": codificar(kwargs)}
    try:
        registro["result"] = codificar(fn(*args, **kwargs))
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        registro["error"] = type(exc).__name__
    chamadas.append(registro)


# ─── Entradas ─────────────────────────────────────────────────────────────

HISTORICOS = [
    "",
    "   ",
    "TARIFA",
    "Tarifa com liquidação",
    "TARIFA  COM/LIQUIDAÇÃO",
    "tarifa-bancaria  pacote\tserviços\n",
    "PIX EMITIDO OUTRA IF Pagamento Pix 38.924.906 0001-75",
    "PAGAMENTO PIX 09033833000123 PERFORMANCE ENGENHA PIX_DEB",
    "LIQUIDACAO BOLETO SICREDI 31052957000105 041 CON 252080163",
    "CRÉD.TED-STR 81.450.538 0001-08 FORNECEDOR EXEMPLO",
    "TED 41250201 0001-24 ACME",
    "DOC 41.250.201-0001-24 e 09.033.8330001-23",
    "PIX ***.674.379-** JOAO",
    "CPF 123.456.789-09 e CPF 12345678909 repetido",
    "12 345 678 9012 34 não é documento",
    "123456789012345678901234 longo",
    "Ação № ½ ﬁnal ＡＢＣ １２３",
    "Café   São João — ÇÃO",
    "18/02/2026 TARIFA COM R LIQUIDACAO COB000001 -1,19 -54.881,83",
    "18/02/2026 PAGAMENTO 1.234,56",
    "VALOR 10,00 SALDO 20,00 OUTRO 30,00",
    "Resgate automático CDB",
    "APLIC AUTOMATICA",
    "Aplicações financeiras",
    "PGTO REF aluguel",
    "pgto  ref. energia",
    "VALOR REF NF 10",
    "REC REF cliente",
    "VLR REF serviço",
    "PGTO REFERENTE X",
    "=SOMA(A1:A2)",
    "+55 41 9999",
    "-desconto",
    "@usuario",
    "  =espaço antes",
    "UNIMED CURITIBA SOC COOP MED",
    "PAGAMENTO FORCECAR AUTOMOTIVE PARCELA 3",
    "Pagamento Forcecar Automotive e Unimed Curitiba",
    "A B C 1 2 3",
    "x" * 20,
    " espaço largo　fim ",
    "\U0001d7d8\U0001d7d9 dígitos matemáticos",
    "٣٤٥ dígitos arábicos 12",
]

for h in HISTORICOS:
    chamar("normalizar_historico_contabil", texto.normalizar_historico_contabil, h)
    chamar("remover_acentos", texto.remover_acentos, h)
    chamar("normalizar_para_match", texto.normalizar_para_match, h)
    chamar("tokens_para_match", texto.tokens_para_match, h)
    for n in (1, 2, 3, 5):
        chamar("chave_agrupamento_historico", texto.chave_agrupamento_historico, h, n)
    chamar("documentos_no_historico", documento_no_historico.documentos_no_historico, h)
    chamar("nucleo_do_nome", contraparte_por_nome.nucleo_do_nome, h)
    chamar("valores_na_linha", validacao.valores_na_linha, h)
    chamar("historico_parece_linha_crua", validacao.historico_parece_linha_crua, h)
    chamar("celula_segura", formatos._celula_segura, h)
    for dc in ("D", "C"):
        chamar("historico_para_dominio", historico.historico_para_dominio, h, dc)
chamar("chave_agrupamento_historico", texto.chave_agrupamento_historico, "TARIFA", 0)
chamar("historico_para_dominio", historico.historico_para_dominio, "TARIFA", "X")
chamar("documentos_no_historico", documento_no_historico.documentos_no_historico, None)
chamar("nucleo_do_nome", contraparte_por_nome.nucleo_do_nome, None)

NOMES = [
    "Forcecar Automotive Ltda.",
    "Cia Brasileira de Alimentos S/A",
    "ABC",
    "ABC Ltda",
    "Unimed Curitiba",
    "Supermercado",
    "Mercado",
    "EI",
    "Filial Matriz",
    "José da Silva ME",
    "Ótica São Luís EIRELI EPP",
    "   ",
]
for nome in NOMES:
    nucleo = contraparte_por_nome.nucleo_do_nome(nome)
    chamar("nucleo_do_nome", contraparte_por_nome.nucleo_do_nome, nome)
    chamar("nucleo_utilizavel", contraparte_por_nome.nucleo_utilizavel, nucleo)


def candidatas(pares):
    return [contraparte_por_nome.CandidataPorNome(contraparte_id=i, nucleo=n) for i, n in pares]


CASOS_NOME = [
    ("PAGAMENTO FORCECAR AUTOMOTIVE PARCELA 3", [("a", "forcecar automotive"), ("b", "unimed curitiba")]),
    ("Pagamento Forcecar Automotive e Unimed Curitiba", [("a", "forcecar automotive"), ("b", "unimed curitiba")]),
    ("PIX UNIMED CURITIBA", [("a", "unimed"), ("a", "unimed curitiba")]),
    ("PIX UNIMED CURITIBA", [("a", "abc"), ("b", "mercado")]),
    ("SUPERMERCADO BOM PRECO", [("a", "supermercado"), ("b", "mercado bom")]),
    ("SUPERMERCADO BOM PRECO", [("a", "supermercado")]),
    ("", [("a", "forcecar automotive")]),
    ("NADA A VER", []),
    ("PIX JOAO DA SILVA ME", [("a", "joao da silva"), ("b", "joao da silva")]),
]
for historico_, pares in CASOS_NOME:
    chamar(
        "casar_por_nome",
        lambda h, ps: contraparte_por_nome.casar_por_nome(h, candidatas(ps)),
        historico_,
        [list(p) for p in pares],
    )

VALORES = [Decimal(v) for v in ("1.19", "54881.83", "1234.56", "10.00", "20.00", "30.00", "0", "-1.19", "15", "999.999")]
for h in HISTORICOS:
    for v in VALORES:
        if len(validacao.valores_na_linha(h)) >= 2 or v == VALORES[0]:
            chamar("motivo_valor_nao_confiavel", validacao.motivo_valor_nao_confiavel, h, v)
for v in ("0", "0.5", "1", "1234567.891", "1234567.895", "1234567.885", "-1234.5", "1000000", "12.345"):
    chamar("reais", validacao.reais, Decimal(v))

CONFERENCIAS = [
    (None, None, "0", "100.00", "2026-02-28"),
    ("100.00", "2026-01-31", "50.00", "150.00", "2026-02-28"),
    ("100.00", "2026-01-31", "50.00", "149.99", "2026-02-28"),
    ("100.00", None, "-20.10", "70.00", None),
    ("100.00", "2026-01-31", "-20.10", "70.00", None),
    ("-5000.00", "2025-12-31", "1234.56", "-3000.00", "2026-01-31"),
]
for sa, da, mov, sd, dd in CONFERENCIAS:
    chamar(
        "conferir_fechamento",
        conferencia.conferir_fechamento,
        saldo_anterior=Decimal(sa) if sa else None,
        data_anterior=date.fromisoformat(da) if da else None,
        movimento=Decimal(mov),
        saldo_declarado=Decimal(sd) if sd else None,
        data_declarada=date.fromisoformat(dd) if dd else None,
    )

for v in ("1500.00", "1500.10", "1500", "0.10", "1234567.891", "-12.30", "0", "100.000", "1E+2", "12.5"):
    chamar("formatar_valor_br", formatos._formatar_valor_br, Decimal(v))

LINHAS_TXT = [
    {
        "Data": "05/01/2026", "Cód. Conta Debito": "1026", "Cód. Conta Credito": "5",
        "Valor": Decimal("1500.10"), "Cód. Histórico": "", "Complemento Histórico": "PGTO REF ALUGUEL; JAN",
        "Inicia Lote": "", "Código Matriz/Filial": "", "Centro de Custo Débito": "", "Centro de Custo Crédito": "",
    },
    {
        "Data": "06/01/2026", "Cód. Conta Debito": "1.1.B.abc", "Cód. Conta Credito": "=1+1",
        "Valor": Decimal("0.50"), "Cód. Histórico": "", "Complemento Histórico": 'VALOR REF "ASPAS" E\nQUEBRA',
        "Inicia Lote": "", "Código Matriz/Filial": "", "Centro de Custo Débito": "", "Centro de Custo Crédito": "",
    },
    {
        "Data": "07/01/2026", "Cód. Conta Debito": "7", "Cód. Conta Credito": "8",
        "Valor": Decimal("1000000"), "Cód. Histórico": "", "Complemento Histórico": "-NEGATIVO ÇÃO",
    },
]
chamar("dicts_to_txt", formatos._dicts_to_txt, LINHAS_TXT, formatos.COLUNAS_LANCAMENTOS_IMPORTACAO)
chamar("dicts_to_csv", formatos._dicts_to_csv, LINHAS_TXT, formatos.COLUNAS_LANCAMENTOS_IMPORTACAO)
chamar("colunas_lancamentos_importacao", lambda: list(formatos.COLUNAS_LANCAMENTOS_IMPORTACAO))

# ─── OFX ──────────────────────────────────────────────────────────────────

SGML = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0756<BRANCHID>1234<ACCTID>98765-4</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260105120000[-3:BRT]
<TRNAMT>-1500.10
<FITID>202601050001
<MEMO>PIX EMITIDO OUTRA IF
<NAME>Pagamento Pix 38.924.906 0001-75
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260106
<TRNAMT>2.500,00
<FITID>202601060002
<MEMO>CRÉD.TED-STR
<NAME>CRÉD.TED-STR
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260107223000.000[-3:BRT]
<TRNAMT>-10,5
<FITID>a"b\\c ç
<MEMO>TARIFA   PACOTE
<NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20260231
<TRNAMT>-1.00
<FITID>X1
<MEMO>DATA INVALIDA
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20260110
<TRNAMT>abc
<FITID>X2
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260110
<TRNAMT>-3.00
<MEMO>SEM FITID
</STMTTRN>
<STMTTRN>
<trntype>debit
<dtposted>202601111530
<trnamt>-0.01
<fitid>min1
<name>só nome
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>9.876,54<DTASOF>20260131</LEDGERBAL>
<AVAILBAL><BALAMT>1.00<DTASOF>20260131</AVAILBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
"""

SGML_SEM_FECHAMENTO = """OFXHEADER:100
<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260301<TRNAMT>-5.00<FITID>A1<MEMO>PRIMEIRA
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260302<TRNAMT>7.00<FITID>A2<MEMO>SEGUNDA
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2<DTASOF>20260302
<LEDGERBAL><BALAMT>3<DTASOF>20260303
</OFX>
"""

XML = """<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260401</DTPOSTED><TRNAMT>-12.34</TRNAMT><FITID>X-1</FITID><MEMO>A &amp; B &#233; &lt;C&gt;</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260402</DTPOSTED><TRNAMT>100</TRNAMT><FITID>X-2</FITID><NAME>Cliente &quot;Um&quot;</NAME><MEMO></MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>2026040</DTPOSTED><TRNAMT>1</TRNAMT><FITID>X-3</FITID></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>87.66</BALAMT><DTASOF>20260430</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
"""

XML_INVALIDO = """<?xml version="1.0"?>
<OFX><STMTTRN><FITID>1</FITID></OFX>
"""

XML_SEM_OFX = """<?xml version="1.0"?>
<NADA/>
"""

OFX_CASOS = {
    "sgml": SGML,
    "sgml_crlf_bom": "﻿" + SGML.replace("\n", "\r\n"),
    "sgml_sem_fechamento": SGML_SEM_FECHAMENTO,
    "xml": XML,
    "xml_invalido": XML_INVALIDO,
    "xml_sem_ofx": XML_SEM_OFX,
    "vazio": "",
    "sem_transacao": "<OFX><LEDGERBAL><BALAMT>10<DTASOF>20260101</LEDGERBAL></OFX>",
}
for nome, conteudo in OFX_CASOS.items():
    chamar(f"parse_ofx:{nome}", ofx_parser.parse_ofx_detalhado, conteudo)

for d in ("20260105", "202601051200", "20260105120000", "20260105120000.123[-3:BRT]", "20260105[+5.5:IST]",
          "2026010", "20261301", "20260230", "20240229", "20230229", "20260105250000", " 20260105 ", "abc", "",
          "20260105235960", "20260105235961", "00000101", "20261232", "20260100", "2026010512", "٢٠٢٦٠١٠٥"):
    chamar("parse_data", ofx_parser._parse_data, d)
for v in ("1500.00", "1.500,00", "1500,5", "-0.01", " 12 ", "1e3", "1_000.5", "NaN", "Infinity", "", "1.2.3", "+7"):
    chamar("valor_monetario", ofx_parser._valor_monetario, v)
for memo, name in (("A", "B"), ("PIX", "pix emitido"), ("Pagamento", None), (None, "Só nome"), ("  a  b ", " a b "),
                   ("CRÉD", "créd"), ("STRASSE", "straße"), (None, None)):
    chamar("montar_historico", ofx_parser._montar_historico, memo, name)

# ─── Chave de duplicidade (extrato/service.py) ────────────────────────────

ns_hash = funcoes_do_fonte(
    raiz / "src/domain/extrato/service.py",
    {"_calcular_hash"},
    {"json": json, "hashlib": __import__("hashlib"), "UUID": object, "TransacaoOFX": object},
)


@dataclass
class _T:
    fitid: str


EMPRESAS = ["1f0e3c1a-7b2d-4c55-9a0e-5d2f8b9c1a00", "00000000-0000-0000-0000-000000000000"]
AGENCIAS = ["9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"]
FITIDS = ["202601050001", "PDF0a1b2c3d4e5f", "", 'a"b\\c', "ç ã 中 😀", "tab\there", "linha\nnova", " ", "\x01"]
from uuid import UUID  # noqa: E402

for e in EMPRESAS:
    for a in AGENCIAS:
        for f in FITIDS:
            chamar("calcular_hash", lambda e_, a_, f_: ns_hash["_calcular_hash"](UUID(e_), UUID(a_), _T(f_)), e, a, f)

# ─── NEO: casamento de regra e histórico sugerido (neo/engine.py) ─────────

ns_neo = funcoes_do_fonte(
    raiz / "src/domain/neo/engine.py",
    {
        "estrategia_de_match_normalizado",
        "estrategia_de_match",
        "gerar_historico_sugerido",
        "motivo_para_nao_contabilizar",
        "NeoEngine._tipos_contraparte_compativeis",
        "NeoEngine._desambiguar_tipos_por_documento",
    },
    {
        "normalizar_para_match": texto.normalizar_para_match,
        "normalizar_historico_contabil": texto.normalizar_historico_contabil,
        "motivo_valor_nao_confiavel": validacao.motivo_valor_nao_confiavel,
        "Transacao": object,
        "Contraparte": object,
        "Regra": object,
    },
)

PARES = [
    ("TARIFA", "TARIFA"),
    ("TARIFA", "Tarifa com liquidação"),
    ("tarifa liquidacao", "TARIFA COM R LIQUIDAÇÃO"),
    ("LIQUIDACAO TARIFA", "TARIFA COM LIQUIDAÇÃO"),
    ("PIX RECEBIDO", "PIX ENVIADO"),
    ("", "QUALQUER"),
    ("", ""),
    ("TAR", "TARIFA"),
    ("TARIFA/BANCO", "tarifa banco"),
    ("tarifa tarifa", "tarifa"),
]
for r, t in PARES:
    chamar("estrategia_de_match", ns_neo["estrategia_de_match"], r, t)
for dc in ("D", "C"):
    for razao, nf in (("Forcecar Automotive Ltda", None), ("forcecar  automotive", "123"), ("Ótica São Luís", "  "), ("X", " 9 ")):
        chamar("gerar_historico_sugerido", ns_neo["gerar_historico_sugerido"], dc, razao, nf)
for h, v in (("18/02/2026 TARIFA COM R LIQUIDACAO COB000001 -1,19 -54.881,83", "54881.83"), ("PIX", "10.00"),
             ("VALOR 10,00 SALDO 20,00 OUTRO 30,00", "15")):
    chamar(
        "motivo_para_nao_contabilizar",
        lambda h_, v_: ns_neo["motivo_para_nao_contabilizar"](types.SimpleNamespace(historico=h_, valor=Decimal(v_))),
        h,
        Decimal(v),
    )


def _desambiguar(lista, dc):
    objs = [types.SimpleNamespace(id=i, documento=d, tipo=t, origem=o) for i, d, t, o in lista]
    resultado = ns_neo["_desambiguar_tipos_por_documento"](
        types.SimpleNamespace(_tipos_contraparte_compativeis=ns_neo["_tipos_contraparte_compativeis"]), objs, dc
    )
    return [o.id for o in resultado]


CASOS_TIPO = [
    [("a", "111", "fornecedor", "manual")],
    [("a", "111", "cliente", "manual")],
    [("a", "111", "cliente", "relatorio_fiscal")],
    [("a", "111", "fornecedor", "relatorio_fiscal"), ("b", "111", "cliente", "relatorio_fiscal")],
    [("a", "111", "ambos", "manual"), ("b", "222", "cliente", "relatorio_fiscal"), ("c", "333", "fornecedor", "backfill")],
    [("a", "111", "fornecedor", "manual"), ("b", "111", "fornecedor", "manual")],
]
for caso in CASOS_TIPO:
    for dc in ("D", "C", "X"):
        chamar("desambiguar_tipos", _desambiguar, [list(c) for c in caso], dc)

saida.parent.mkdir(parents=True, exist_ok=True)
saida.write_text(
    json.dumps({"origem": "dev41tech/contabil-core e074176", "chamadas": chamadas}, ensure_ascii=False, indent=1),
    encoding="utf-8",
)
print(f"{len(chamadas)} chamadas gravadas em {saida}")
