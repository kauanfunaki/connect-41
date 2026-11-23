"""Gabarito dos leitores de fatura de cartão, Bloco C, Fase C3 (23/11/2026).

Plugin do pytest: roda a suíte do original (dev41tech/contabil-core) que exercita o leitor de fatura
(`src/domain/cartoes/pdf_parser.py`) e o documento revisável da fatura (`src/domain/cartoes/documentos.py`)
e grava cada chamada de `_parse_valor`, `_parse_data`, `_referencia_fatura`, `_parse_por_regex`,
`_validar_total_declarado` e, de `documentos.py`, `_dinheiro` e `validar_itens`, com a entrada e a saída
exatas. As leituras inteiras da suíte (`ler_documento` e `_vision`) entram como CENÁRIO: o PDF, a
competência, a configuração e as respostas que a IA simulada da suíte deu. O cenário é REPETIDO aqui,
com a IA simulada por este plugin (a OpenAI trocada por uma falsa), primeiro com a entrada original (o
resultado tem de ser o da suíte, senão o plugin aborta) e depois com a entrada sanitizada, que é a que
vai para o gabarito.

Depois acrescenta casos inventados com semente fixa: linhas de fatura de todos os jeitos (mês em número e
abreviado, hora, parcela, R$, sinal antes e depois, linhas puladas), totais declarados, respostas da IA
(em lista, dentro de objeto, cercadas por ```, quebradas) e itens dela, PDFs de fatura gerados aqui (o
layout genérico, a composição com e sem grade, o texto com pagamento anterior e estorno, a página em
branco que vai para a imagem) e cenários para cada ramo da leitura inteira (`parse_pdf` e `ler_documento`:
a IA desligada e sem chave, a resposta incompleta, inválida, o item ilegível, os totais de várias
páginas, o tempo e as páginas esgotados). A IA de verdade nunca é chamada.

O porte em TypeScript repete as chamadas (`src/lib/contabil-core/cartoes/leitor.test.ts` e
`documentos.test.ts`).

O ano corrente (`_resolve_ano` sem vencimento) fica fixo em 2026 durante a gravação.

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, e os CNPJs
que não são de exemplo viram fictícios começando com 9 (`gabarito_cruzamento.sanitizar_texto`).

Uso, a partir da raiz do contabil-core (com pdfplumber, PyMuPDF e pytest; o `-I` ignora o PYTHONPATH, então o
caminho do plugin entra pelo `-c`):
    GABARITO_NOMES=... PYTHONDONTWRITEBYTECODE=1 GABARITO_PASTA=<connect>/src/lib/contabil-core/cartoes/gabarito \\
        python -I -W ignore -c "import sys; sys.path.insert(0, '<connect>/scripts/contabil-core'); import pytest; \\
        sys.exit(pytest.main(['-q', '-p', 'no:cacheprovider', '-p', 'gabarito_cartoes', \\
        'tests/unit/test_cartoes_pdf_parser.py', 'tests/unit/test_fatura_documentos.py']))"

Para gerar de novo, o GABARITO_NOMES (fora do git) precisa também dos nomes de estabelecimentos que aparecem nas
linhas de fatura de `tests/unit/test_cartoes_pdf_parser.py` do original.

Conferência local em arquivos reais (a saída fica FORA do repositório, só com os resultados):
    python -I -W ignore <connect>/scripts/contabil-core/gabarito_cartoes.py conferir <saida.json> <arquivo>...
"""
from __future__ import annotations

import dataclasses
import functools
import hashlib
import json
import os
import random
import sys
from datetime import UTC, date, datetime
from decimal import Decimal

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402

chamadas: dict[str, dict] = {}
conteudos: dict[str, bytes] = {}
_CENARIOS_DA_SUITE: list[tuple[bytes, str, dict, dict]] = []
_ESTADO = {"dentro": 0}
ANO_FIXO = 2026


# ─── Sanitização e codificação ──────────────────────────────────────────────

def sanitizar(v):
    if isinstance(v, str):
        return sanitizar_texto(v)
    if isinstance(v, list):
        return [sanitizar(x) for x in v]
    if isinstance(v, tuple):
        return tuple(sanitizar(x) for x in v)
    if isinstance(v, dict):
        return {k: sanitizar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return dataclasses.replace(v, **{f.name: sanitizar(getattr(v, f.name)) for f in dataclasses.fields(v)})
    return v


def codificar(v):
    """JSON simples: objeto para dict de chaves texto; o resto marcado ($dec, $dt, $f, $int, $arquivo)."""
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, int):
        return {"$int": str(v)} if abs(v) > 2**53 else v
    if isinstance(v, float):
        return {"$f": repr(v)}
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    if isinstance(v, datetime):
        return {"$dt": v.isoformat()}
    if isinstance(v, date):
        return {"$d": v.isoformat()}
    if isinstance(v, bytes):
        sha = hashlib.sha256(v).hexdigest()[:12]
        conteudos.setdefault(sha, v)
        return {"$arquivo": sha}
    if isinstance(v, (list, tuple)):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        return {str(k): codificar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return {f.name: codificar(getattr(v, f.name)) for f in dataclasses.fields(v)}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


def _erro(exc: BaseException) -> dict:
    mensagem = getattr(exc, "message", None) or str(exc)
    return {"tipo": type(exc).__name__, "mensagem": mensagem}


def _registrar(nome, fn, args, extra_args=None):
    """Grava `fn(*args)`; `extra_args` é o que vai para o gabarito no lugar de `args` (ex.: o JSON em texto)."""
    entrada = {"fn": nome, "args": codificar(list(extra_args if extra_args is not None else args))}
    try:
        entrada["result"] = codificar(fn(*args))
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        entrada["error"] = _erro(exc)
    chave = json.dumps([entrada["fn"], entrada["args"]], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)
    return entrada


def _modulos():
    sys.path.insert(0, os.getcwd())
    from src.domain.cartoes import documentos, pdf_parser

    return pdf_parser, documentos


class _DataFixa(datetime):
    """`datetime` com o `now()` fixo: o ano das compras sem ano e sem vencimento."""

    @classmethod
    def now(cls, tz=None):
        return datetime(ANO_FIXO, 11, 23, 12, 0, tzinfo=tz)


_PURAS_PP = ("_parse_valor", "_parse_data", "_referencia_fatura", "_parse_por_regex", "_validar_total_declarado")
_PURAS_DM = ("_dinheiro", "validar_itens")


def envolver(modulo, prefixo, nome_fn):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        try:
            return original(*args, **kwargs)
        finally:
            if _ESTADO["dentro"] == 0:
                posicionais = list(args) + [kwargs[k] for k in ("referencia",) if k in kwargs]
                _registrar(f"{prefixo}.{nome_fn}", original, sanitizar(posicionais))

    gravador.__gabarito__ = True
    setattr(modulo, nome_fn, gravador)


# ─── A IA simulada ──────────────────────────────────────────────────────────

class _Segredo:
    def get_secret_value(self):
        return "sk-gabarito"


class _Config:
    def __init__(self, c: dict):
        self.openai_enabled = c["openai_enabled"]
        self.allow_financial_data_to_openai = c["allow"]
        self.openai_api_key = _Segredo() if c["openai_enabled"] else None
        self.pdf_parse_timeout_seconds = c["parse_timeout"]
        self.pdf_max_pages = c["max_pages"]
        self.pdf_max_ai_calls = c["max_ai_calls"]
        self.pdf_vision_timeout_seconds = c["vision_timeout"]
        self.pdf_vision_call_timeout_seconds = c["call_timeout"]
        self.cartoes_vision_model = "modelo-de-imagem"


def _openai_falsa(c: dict, feitas: list):
    filas = [dict(r) for r in c["respostas"]]

    class Completions:
        def create(self, *, model, messages, **kw):
            usuario = messages[1]["content"]
            if isinstance(usuario, str):
                feitas.append({"tipo": "texto", "modelo": model, "texto": usuario, "sistema": messages[0]["content"],
                               "max_tokens": kw.get("max_tokens")})
            else:
                feitas.append({"tipo": "visao", "modelo": model, "sistema": messages[0]["content"],
                               "max_completion_tokens": kw.get("max_completion_tokens"), "partes": len(usuario)})
            if c.get("falha"):
                raise RuntimeError("falha simulada do provedor")
            r = filas.pop(0) if len(filas) > 1 else (filas[0] if filas else {"content": "", "finish_reason": "stop"})

            class R:
                choices = [type("C", (), {"finish_reason": r.get("finish_reason", "stop"),
                                          "message": type("M", (), {"content": r["content"]})()})()]

            return R()

    class Cliente:
        def __init__(self, api_key=None, max_retries=None):  # noqa: ARG002
            self.chat = type("Chat", (), {"completions": Completions()})()

    return Cliente


PADRAO = {"openai_enabled": True, "allow": True, "max_pages": 120, "max_ai_calls": 30, "parse_timeout": 60,
          "vision_timeout": 300, "call_timeout": 120, "respostas": [], "falha": False, "linhas": None, "total": None}


def rodar_cenario(pp, dm, tipo: str, conteudo: bytes, competencia: str | None, c: dict) -> dict:
    """`parse_pdf` (tipo "pdf") ou `ler_documento` (tipo "documento") com a configuração e as respostas de `c`."""
    import openai

    feitas: list = []
    guardados = (openai.OpenAI, pp.get_settings, dm.get_settings, pp._extrair_linhas, pp.datetime)
    openai.OpenAI = _openai_falsa(c, feitas)
    pp.get_settings = dm.get_settings = lambda: _Config(c)
    pp.datetime = _DataFixa
    if c.get("linhas") is not None:
        pp._extrair_linhas = lambda _conteudo, _budget: (list(c["linhas"]), c["total"])
    _ESTADO["dentro"] += 1
    saida: dict = {}
    try:
        try:
            r = pp.parse_pdf(conteudo) if tipo == "pdf" else dm.ler_documento(conteudo, competencia)
            saida["result"] = codificar(r)
        except Exception as exc:  # noqa: BLE001
            saida["error"] = _erro(exc)
    finally:
        _ESTADO["dentro"] -= 1
        openai.OpenAI, pp.get_settings, dm.get_settings, pp._extrair_linhas, pp.datetime = guardados
    saida["chamadas_ia"] = feitas
    return saida


def cenario(pp, dm, tipo: str, nome: str, conteudo: bytes, competencia: str | None = None, **c) -> None:
    config = {**PADRAO, **c}
    saida = rodar_cenario(pp, dm, tipo, conteudo, competencia, config)
    entrada = {"fn": f"{'leitor' if tipo == 'pdf' else 'documentos'}.cenario", "nome": nome,
               "args": [codificar(conteudo), competencia, config], **saida}
    chamadas.setdefault(json.dumps(["cenario", tipo, nome], ensure_ascii=False), entrada)


def visao_direta(dm, nome: str, resposta: dict, competencia: str = "2026-04", falha: bool = False) -> None:
    """`_vision` sozinho, com uma resposta simulada (a suíte testa a resposta incompleta assim)."""
    import openai

    feitas: list = []
    guardados = (openai.OpenAI, dm.get_settings)
    openai.OpenAI = _openai_falsa({"respostas": [resposta], "falha": falha}, feitas)
    dm.get_settings = lambda: _Config({**PADRAO})
    visao = getattr(dm._vision, "__wrapped__", dm._vision)
    saida: dict = {}
    try:
        try:
            saida["result"] = codificar(visao(b"imagem-simulada", competencia, 1))
        except Exception as exc:  # noqa: BLE001
            saida["error"] = _erro(exc)
    finally:
        openai.OpenAI, dm.get_settings = guardados
    entrada = {"fn": "documentos._vision", "nome": nome, "args": [competencia, resposta, falha], **saida, "chamadas_ia": feitas}
    chamadas.setdefault(json.dumps(["visao", nome], ensure_ascii=False), entrada)


def _instalar_captura(pp, dm) -> None:
    """Grava as leituras inteiras da suíte (`ler_documento`) como cenários, e o `_vision` direto."""
    original = dm.ler_documento
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def captura(conteudo, competencia):
        if _ESTADO["dentro"]:
            return original(conteudo, competencia)
        s = dm.get_settings()
        respostas: list[dict] = []
        visao_da_suite = dm._vision

        def visao_gravando(imagem, referencia, timeout):
            r = visao_da_suite(imagem, referencia, timeout)
            respostas.append({"content": json.dumps(r, ensure_ascii=False), "finish_reason": "stop"})
            return r

        dm._vision = visao_gravando
        _ESTADO["dentro"] += 1
        real: dict = {}
        try:
            try:
                r = original(conteudo, competencia)
                real["result"] = codificar(r)
                return r
            except Exception as exc:
                real["error"] = _erro(exc)
                raise
        finally:
            _ESTADO["dentro"] -= 1
            dm._vision = visao_da_suite
            config = {
                **PADRAO,
                "openai_enabled": bool(getattr(s, "openai_enabled", False)),
                "allow": bool(getattr(s, "allow_financial_data_to_openai", False)),
                "max_pages": getattr(s, "pdf_max_pages", 120), "max_ai_calls": getattr(s, "pdf_max_ai_calls", 30),
                "parse_timeout": getattr(s, "pdf_parse_timeout_seconds", 60),
                "vision_timeout": getattr(s, "pdf_vision_timeout_seconds", 300),
                "call_timeout": getattr(s, "pdf_vision_call_timeout_seconds", 120),
                "respostas": respostas,
            }
            _CENARIOS_DA_SUITE.append((conteudo, competencia, config, real))

    captura.__gabarito__ = True
    dm.ler_documento = captura

    visao = dm._vision

    @functools.wraps(visao)
    def visao_capturada(imagem, referencia, timeout):
        """A suíte chama `_vision` direto com a OpenAI falsa dela: grava a resposta e o resultado."""
        if _ESTADO["dentro"]:
            return visao(imagem, referencia, timeout)
        import openai

        respostas = []
        cliente_da_suite = openai.OpenAI

        def cliente(**kw):
            real = cliente_da_suite(**kw)
            criar = real.chat.completions.create

            def create(**kw2):
                r = criar(**kw2)
                respostas.append({"content": r.choices[0].message.content, "finish_reason": r.choices[0].finish_reason})
                return r

            real.chat.completions.create = create
            return real

        openai.OpenAI = cliente
        try:
            return visao(imagem, referencia, timeout)
        finally:
            openai.OpenAI = cliente_da_suite
            if respostas:
                visao_direta(dm, f"suite-visao-{len(respostas)}-{respostas[0]['finish_reason']}", respostas[0], referencia)

    visao_capturada.__gabarito__ = True
    dm._vision = visao_capturada


def pytest_configure(config):  # noqa: ARG001
    pp, dm = _modulos()
    pp.datetime = _DataFixa
    for fn in _PURAS_PP:
        envolver(pp, "leitor", fn)
    for fn in _PURAS_DM:
        envolver(dm, "documentos", fn)
    _instalar_captura(pp, dm)


# ─── PDFs inventados ────────────────────────────────────────────────────────

def pdf_de_paginas(paginas: list[list[str]], largura: float = 595, fonte: float = 9) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for linhas in paginas:
        pagina = doc.new_page(width=largura, height=842)
        y = 60
        for linha in linhas:
            if linha:
                pagina.insert_text((40, y), linha, fontsize=fonte)
            y += 16
    dados = doc.tobytes()
    doc.close()
    return dados


def pdf_em_grade(linhas: list[list[str]], quebrar: dict[tuple[int, int], str] | None = None, titulo: list[str] | None = None) -> bytes:
    """A composição em tabela com a grade desenhada (5 colunas); `quebrar` põe uma 2ª linha numa célula."""
    import pymupdf

    quebrar = quebrar or {}
    doc = pymupdf.open()
    p = doc.new_page(width=595, height=842)
    y = 50
    for t in titulo or []:
        p.insert_text((40, y), t, fontsize=10)
        y += 16
    xs = [40, 110, 170, 400, 460, 555]
    altura = 30
    topo = y + 10
    for i, linha in enumerate(linhas):
        y0 = topo + i * altura
        for j, celula in enumerate(linha):
            p.draw_rect(pymupdf.Rect(xs[j], y0, xs[j + 1], y0 + altura), color=(0, 0, 0), width=0.6)
            p.insert_text((xs[j] + 3, y0 + 12), celula, fontsize=8)
            if (i, j) in quebrar:
                p.insert_text((xs[j] + 3, y0 + 24), quebrar[(i, j)], fontsize=8)
    dados = doc.tobytes()
    doc.close()
    return dados


def pdf_em_branco(paginas: int = 1) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for _ in range(paginas):
        doc.new_page()
    dados = doc.tobytes()
    doc.close()
    return dados


GENERICA = [
    "BANCO EXEMPLO - FATURA DO CARTAO",
    "Vencimento 10/01/2026",
    "Data Descrição Valor",
    "05/12 MERCADO EXEMPLO 150,00",
    "07/12 UBER *TRIP 02/03 45,90",
    "16/dez 08:08 POSTO EXEMPLO R$ 317,93",
    "15/dez 20:55 Pagamento 004691404 -R$ 1.249,28",
    "02/01/2026 LIVRARIA FICTICIA 1.000,00",
    "TOTAL DESTA FATURA 1.513,83",
]

COMPOSICAO = [
    "CARTAO EXEMPLO 2026",
    "Fatura de ABRIL",
    "TOTAL FATURA 310,00",
    "24-fev Fisico UBER 20,00",
    "2-mar Físico LIMPEZA 80,00",
    "15-dez Virtual ASSINATURA 10,00",
    "1-abr fisico MATERIAL 200,00",
]

TEXTO = [
    "FATURA EXEMPLO",
    "Total da fatura R$ 1.234,56",
    "01/03/2026 COMPRA COM DESCRICAO BEM COMPLETA 1.000,00",
    "05/03 OUTRA COMPRA 234,56",
    "06/03 ESTORNO DE COMPRA -50,00",
    "10/03/2026 PAGAMENTO EFETUADO -R$ 900,00",
    "11/03 ZERADA 0,00",
]


def _item(**k):
    base = {"data": "05/01/2026", "descricao": "MERCADO LIVRE*COMPRA", "valor": Decimal("150.00"), "parcela_atual": None,
            "parcela_total": None}
    base.update(k)
    return base


def chamadas_diretas(pp, dm, rng: random.Random) -> None:
    for v in ["1.234,56", "R$ 45,90", "-150,00", "R$\xa01.000,00", "-R$ 39.249,28", "- R$ 5,00", "R$ -5,00", "(5,00)", "1,5", "abc",
              "", "١٢٣,٤٥", "0,00", "-0,00", "1.234.567.890.123.456.789.012.345.678,99", "-1.234.567.890.123.456.789.012.345.678,99",
              "12,345,67", "R$ 1 234,56", "1_000,00", "+3,00", "NaN", "-inf"]:
        _registrar("leitor._parse_valor", pp._parse_valor, [v])
    refs = [None, (2026, 1), (2026, 12), (2026, 13), (1, 1)]
    for v in ["05/03/2026", "05/03/26", "05/03/202", "31/02/2026", "29/02/2024", "00/01/2026", "05/13/2026", "05/03/0000", "05/03",
              "16/dez", "16/DEZ", "16/Dez", "01/jan", "31/fev", "05/xyz", "05/1a", "05/00", "5/03", " 05/03 ", "05/ço", "٠٥/٠٣/٢٠٢٦",
              "05/03/2026 10:00", "16/de", "29/02", "16/dez/2025"]:
        for ref in refs:
            _registrar("leitor._parse_data", pp._parse_data, [v, ref])
    for linhas in [["Vencimento 13/01/2026"], ["vencimento   05/12/2025 x"], ["VENCIMENTO 01/13/2026"], ["Vencimento: 13/01/2026"],
                   ["Data de vencimento 01/02/2027", "Vencimento 02/03/2028"], ["nada"], [], ["Vencimento 13/01/26"]]:
        _registrar("leitor._referencia_fatura", pp._referencia_fatura, [linhas])
    blocos = [GENERICA, COMPOSICAO, TEXTO,
              ["05/03  POSTO EXEMPLO  150,00"], ["07/03  UBER *TRIP  02/03  45,90"], ["Total desta fatura  150,00", "Página 1 de 1"],
              ["Saldo anterior 05/03 X 1,00"], ["Lançamentos 05/03 X 1,00"], ["Data 05/03 X 1,00"], ["Datas 05/03 X 1,00"],
              ["05/03 Pagamento mínimo 1,00"], ["Pagamento mínimo 05/03 1,00"], ["05/03 COMPRA 0,00"], ["05/03 COMPRA -10,00"],
              ["05/03 COMPRA - R$ 10,00"], ["05/03 COMPRA R$ - 10,00"], ["05/03 COMPRA R$10,00"], ["05/03 08:08 COMPRA 1,00"],
              ["05/03 08:08 1,00"], ["05/03  1,00"], ["05/03 A 1/12 10,00"], ["05/03 A 123/12 10,00"], ["05/03 A 01/03"],
              ["05/03/2026 COMPRA 1.000.000,00"], ["05/03/2026 COMPRA 1000,00"], ["31/02 COMPRA 1,00"], ["05/xyz COMPRA 1,00"],
              ["16/dez COMPRA 1,00", "16/jan COMPRA 2,00"], ["05/03 " + "X" * 300 + " 1,00"], ["  05/03 COMPRA 1,00  "],
              ["05/03 COMPRA 1,00 extra"], ["05/03\tCOMPRA\t1,00"], ["05/03 COMPRA\xa01,00"], ["05/03 COMPRA 02/03 R$ 7.771,00"],
              ["05/03/26 COMPRA 1,00"], ["05/03/2026/1 COMPRA 1,00"], ["Fatura 05/03 COMPRA 1,00"], ["Cartao 05/03 COMPRA 1,00"],
              [""], []]
    palavras = ["05/03", "16/dez", "08:08", "COMPRA", "UBER", "*TRIP", "02/03", "R$", "-R$", "150,00", "1.234,56", "-", "Total",
                "Pagamento", "Saldo", "Vencimento", "10/01/2026", "MERCADO", "(5,00)", "0,00", "12/12", "31/12/2025"]
    for _ in range(150):
        blocos.append([" ".join(rng.choice(palavras) for _ in range(rng.randint(1, 7))) for _ in range(rng.randint(1, 6))])
    for b in blocos:
        for ref in (None, (2026, 1), (2026, 12)):
            _registrar("leitor._parse_por_regex", pp._parse_por_regex, [b, ref])

    def lanc(*valores):
        return [pp.LancamentoPDF(data_compra=datetime(2026, 3, 5, tzinfo=UTC), descricao="A", valor=Decimal(v)) for v in valores]

    totais = [["TOTAL DESTA FATURA  150,00"], ["Total da Fatura R$ 150,00"], ["VALOR TOTAL DA FATURA: R$ 150,04"],
              ["valor total 150,06"], ["TOTAL A PAGAR -150,00"], ["TOTAL FATURA 150,00"], ["nenhum total"],
              ["TOTAL DESTA FATURA ................................ 150,00"], ["TOTAL\nDESTA FATURA 150,00"],
              ["VALOR TOTAL", "150,00"], ["TOTAL A PAGAR 1.234.567.890.123.456.789.012.345.678,99"]]
    conjuntos = [lanc("100.00", "50.00"), lanc("150.00"), lanc("150.05"), lanc("149.94"), lanc("150.1"), lanc(), lanc("1E+2", "50"),
                 lanc("Infinity"), lanc("NaN"), lanc("1234567890123456789012345678.99")]
    for t in totais:
        for c in conjuntos:
            _registrar("leitor._validar_total_declarado", pp._validar_total_declarado, [t, c])

    respostas = ["[]", "{}", "não sei", "", '[{"data":"05/01/2026","descricao":"X","valor":1.5}]',
                 '```json\n[{"data":"05/01/2026","descricao":"X","valor":1}]\n```', '```\n[]\n```',
                 '{"lancamentos": [{"data": "05/01/2026"}]}', '{"compras": [1]}', '{"items": "x", "data": [2]}', '{"data": {}}',
                 '{"outro": []}', "[1, 2]", '"texto"', "42", '[{"valor": NaN}]', "[1,]", '  [ {"a" : 1.0e3} ]  ', '[{"a":1}] lixo']
    for r in respostas:
        _registrar("leitor._parse_ai_response", pp._parse_ai_response, [r])

    itens = [_item(), _item(valor=Decimal("45.90"), parcela_atual=2, parcela_total=3), _item(data="5/1/2026"), _item(data="16/dez"),
             _item(data="16/12"), _item(data=None), _item(data=""), _item(data=5), _item(data="31/02/2026"), _item(descricao=None),
             _item(descricao=""), _item(descricao="  X  "), _item(descricao="D" * 300), _item(descricao=12), _item(valor=None),
             _item(valor=0), _item(valor=Decimal("0.00")), _item(valor=Decimal("-45.90")), _item(valor="1.234,56"), _item(valor="150"),
             _item(valor=" 15.5 "), _item(valor=Decimal("1E+2")), _item(valor=True), _item(valor=False), _item(valor=float("nan")),
             _item(valor=float("inf")), _item(valor="sNaN"), _item(valor="-Infinity"), _item(valor=[1]), _item(valor="1_000"),
             _item(parcela_atual="2", parcela_total="3"), _item(parcela_atual="2.0"), _item(parcela_atual=Decimal("2.7")),
             _item(parcela_atual=0), _item(parcela_atual="0"), _item(parcela_atual=-1), _item(parcela_atual=True),
             _item(parcela_atual=float("nan")), _item(parcela_atual=float("inf")), _item(parcela_total=Decimal("Infinity")),
             _item(parcela_atual=[1]), _item(parcela_atual=" 3 "), _item(parcela_atual="٣"), _item(parcela_atual="1_0"),
             _item(parcela_atual=Decimal("NaN")), _item(parcela_atual=Decimal("-0.5")), {"valor": 1}, {}, {"data": "05/01/2026", "valor": 1}]
    for it in itens:
        # O item como a IA o mandaria (JSON) e como o `json.loads(..., parse_float=Decimal)` o lê.
        texto = _json_do_item(it)
        _registrar("leitor._lancamento_from_ai", lambda t: pp._lancamento_from_ai(json.loads(t, parse_float=Decimal)), [texto])
    for t in ["1", '"x"', "[1]", "null", "true"]:
        _registrar("leitor._lancamento_from_ai", lambda t: pp._lancamento_from_ai(json.loads(t, parse_float=Decimal)), [t])

    for v in ["20,00", "1.234,56", "1234.56", "R$ 1.234,56", "20", "20.000", "20.001", "1,2,3", "1.2.3", "NaN", "Infinity", "-5,00",
              "9999999999999,99", "10000000000000,00", "", "  ", "abc", "0,001", "٢٠,٠٠", "1_000,00", "1 000,00", "-0,00",
              "20.000000000000000000000000000000", "0.0000000000000000000000000000001", "1e2", "1E-2", "(5,00)"]:
        _registrar("documentos._dinheiro", dm._dinheiro, [v])
    for t in ["20.5", "20", "1e16", "1e400", "-0.0", "0.1", "true", "null", "[1]", '"20,00"', "NaN", "19.999999999999996", "1.005"]:
        _registrar("documentos._dinheiro_json", lambda t: dm._dinheiro(json.loads(t)), [t])

    def it(**k):
        base = {"data": "2026-03-01", "descricao": "UBER", "valor": "20.00", "referencia": ""}
        base.update(k)
        return base

    listas = [
        ([it(), it()], "40.00"), ([it(), it()], "20.00"), ([it(valor="NaN")], "20.00"), ([it(data="2026-02-30")], "20.00"),
        ([], "0"), ([it(data="2026-3-1")], "20.00"), ([it(data="2026-03-1")], "20,00"), ([it(data=" 2026-03-01")], "20.00"),
        ([it(data="2026-03- 1")], "20.00"), ([it(data="0000-03-01")], "20.00"), ([it(data="2026-13-01")], "20.00"),
        ([it(data="26-03-01")], "20.00"), ([it(data="2026-03-011")], "20.00"), ([it(data="٢٠٢٦-٠٣-٠١")], "20.00"),
        ([it(descricao="   ")], "20.00"), ([it(descricao=" X ")], "20.00"), ([it(descricao="D" * 501)], "20.00"),
        ([it(descricao="D" * 500)], "20.00"), ([it(valor="0,00")], "0"), ([it(valor="-1,00")], "-1"), ([it(valor="20.001")], "20.00"),
        ([it(valor="1.234,56")], "1234.56"), ([it(valor="20")], "20.00"), ([it(valor="20.000")], "20"), ([it()], "abc"),
        ([it()], "R$ 20,00"), ([it(referencia="R" * 150)], "20.00"), ([{"data": "2026-03-01", "descricao": "X", "valor": "1,00"}], "1"),
        ([{"descricao": "X", "valor": "1,00"}], "1"), ([{"data": "2026-03-01", "valor": "1,00"}], "1"),
        ([{"data": "2026-03-01", "descricao": "X"}], "1"), ([it(), it(valor="abc"), it(data="x")], "20.00"),
        ([it(data="x", valor="abc")], "20.00"), ([it(valor="abc", descricao="")], "20.00"), ([it(descricao="", valor="0")], "20.00"),
    ]
    for itens_, total in listas:
        _registrar("documentos.validar_itens", dm.validar_itens, [itens_, total])


def _json_do_item(it: dict) -> str:
    """O item como texto JSON: Decimal vira número literal; float nan/inf vira NaN/Infinity."""
    partes = []
    for k, v in it.items():
        if isinstance(v, Decimal):
            lit = str(v) if v.is_finite() else ("NaN" if v.is_nan() else ("-Infinity" if v < 0 else "Infinity"))
        else:
            lit = json.dumps(v, ensure_ascii=False)
        partes.append(f"{json.dumps(k)}: {lit}")
    return "{" + ", ".join(partes) + "}"


def cenarios_inventados(pp, dm) -> None:
    item = json.dumps([{"data": "05/01/2026", "descricao": "MERCADO LIVRE*COMPRA", "valor": 150.00, "parcela_atual": None, "parcela_total": None},
                       {"data": "07/01/2026", "descricao": "UBER *TRIP", "valor": 45.90, "parcela_atual": 2, "parcela_total": 3}])
    sem_total = ["FATURA DE CARTAO EXEMPLO", "Compras do mês", "Supermercado exemplo cento e cinquenta", "Transporte por aplicativo"]
    com_total = sem_total + ["VALOR TOTAL DA FATURA: R$ 195,90"]
    errado = sem_total + ["TOTAL A PAGAR 500,00"]
    r = lambda t: [{"content": t, "finish_reason": "stop"}]  # noqa: E731

    # parse_pdf
    cenario(pp, dm, "pdf", "pdf-generica", pdf_de_paginas([GENERICA]))
    cenario(pp, dm, "pdf", "pdf-generica-ia-desligada", pdf_de_paginas([GENERICA]), openai_enabled=False, allow=False)
    cenario(pp, dm, "pdf", "pdf-generica-total-errado", pdf_de_paginas([GENERICA[:-1] + ["TOTAL DESTA FATURA 9.999,99"]]))
    cenario(pp, dm, "pdf", "pdf-generica-duas-paginas", pdf_de_paginas([GENERICA[:4], GENERICA[4:]]))
    cenario(pp, dm, "pdf", "pdf-generica-sem-vencimento", pdf_de_paginas([GENERICA[2:]]))
    cenario(pp, dm, "pdf", "pdf-composicao-pelo-leitor", pdf_de_paginas([COMPOSICAO]))
    for enabled in (True, False):
        for allow in (True, False):
            sufixo = f"{'chave' if enabled else 'sem-chave'}-{'liberada' if allow else 'bloqueada'}"
            cenario(pp, dm, "pdf", f"pdf-sem-layout-{sufixo}", pdf_de_paginas([com_total]), openai_enabled=enabled, allow=allow,
                    respostas=r(item))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-sem-total", pdf_de_paginas([sem_total]), respostas=r(item))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-total-errado", pdf_de_paginas([errado]), respostas=r(item))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-cercada", pdf_de_paginas([com_total]), respostas=r("```json\n" + item + "\n```"))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-objeto", pdf_de_paginas([com_total]), respostas=r('{"compras": ' + item + "}"))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-vazia", pdf_de_paginas([com_total]), respostas=r("[]"))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-lixo", pdf_de_paginas([com_total]), respostas=r("não consegui"))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-item-nao-objeto", pdf_de_paginas([com_total]), respostas=r("[1, 2]"))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-nan-com-total", pdf_de_paginas([com_total]),
            respostas=r('[{"data":"05/01/2026","descricao":"X","valor":NaN}]'))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-nan-sem-total", pdf_de_paginas([sem_total]),
            respostas=r('[{"data":"05/01/2026","descricao":"X","valor":NaN}]'))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-infinito", pdf_de_paginas([com_total]),
            respostas=r('[{"data":"05/01/2026","descricao":"X","valor":"Infinity"}]'))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-parcela-infinita", pdf_de_paginas([com_total]),
            respostas=r('[{"data":"05/01/2026","descricao":"X","valor":1,"parcela_atual":Infinity}]'))
    cenario(pp, dm, "pdf", "pdf-sem-layout-ia-sem-ano", pdf_de_paginas([sem_total]),
            respostas=r('[{"data":"16/dez","descricao":"X","valor":1},{"data":"05/01","descricao":"Y","valor":"2.50"}]'))
    cenario(pp, dm, "pdf", "pdf-sem-layout-falha", pdf_de_paginas([com_total]), respostas=r(item), falha=True)
    cenario(pp, dm, "pdf", "pdf-sem-layout-sem-chamadas", pdf_de_paginas([com_total]), respostas=r(item), max_ai_calls=0)
    cenario(pp, dm, "pdf", "pdf-em-branco", pdf_em_branco())
    cenario(pp, dm, "pdf", "pdf-texto-curto", pdf_de_paginas([["05/03 X 1,00"]]))
    cenario(pp, dm, "pdf", "pdf-paginas-demais", pdf_de_paginas([GENERICA] * 3), max_pages=2)
    cenario(pp, dm, "pdf", "pdf-sem-objetos", b"%PDF-1.4\n%%EOF")
    cenario(pp, dm, "pdf", "pdf-vazio", b"")
    longas = ["LINHA %04d " % i + "Y" * 250 for i in range(400)]
    cenario(pp, dm, "pdf", "texto-longo", b"%PDF-1.4 qualquer", linhas=longas, total=sum(len(x) for x in longas), respostas=r(item))
    cenario(pp, dm, "pdf", "texto-pronto-49", b"%PDF-1.4 qualquer", linhas=GENERICA, total=49)
    cenario(pp, dm, "pdf", "texto-pronto-50", b"%PDF-1.4 qualquer", linhas=GENERICA, total=50)

    for pdf in tabelas_inventadas():
        _registrar("plumber.extract_tables", _tabelas_do_pdf, [pdf])

    for k, linhas in enumerate([GENERICA, COMPOSICAO, TEXTO, sem_total]):
        pdf = pdf_de_paginas([linhas, linhas[::-1]])
        _registrar("leitor._extrair_linhas", lambda c: pp._extrair_linhas(c, _orcamento(pp)), [pdf])

    # ler_documento
    doc = lambda nome, conteudo, comp="2026-04", **c: cenario(pp, dm, "documento", nome, conteudo, comp, **c)  # noqa: E731
    doc("doc-composicao", pdf_de_paginas([COMPOSICAO]))
    doc("doc-composicao-janeiro", pdf_de_paginas([COMPOSICAO]), "2026-01")
    doc("doc-composicao-duas-paginas", pdf_de_paginas([COMPOSICAO[:4], COMPOSICAO[4:]]))
    doc("doc-composicao-soma-errada", pdf_de_paginas([[*COMPOSICAO[:2], "TOTAL FATURA 999,00", *COMPOSICAO[3:]]]))
    doc("doc-composicao-mes-invalido", pdf_de_paginas([[*COMPOSICAO, "3-xyz Fisico OUTRA 1,00"]]))
    doc("doc-composicao-dia-invalido", pdf_de_paginas([[*COMPOSICAO, "31-fev Fisico OUTRA 1,00"]]))
    doc("doc-composicao-valor-ilegivel", pdf_de_paginas([[*COMPOSICAO, "3-mar Fisico OUTRA 1,2,3"]]))
    doc("doc-composicao-sem-total", pdf_de_paginas([[x for x in COMPOSICAO if "TOTAL" not in x] + ["TOTAL FATURA"]]))
    doc("doc-composicao-total-minusculo", pdf_de_paginas([[x.replace("TOTAL FATURA", "total fatura") for x in COMPOSICAO]]))
    doc("doc-composicao-tempo", pdf_de_paginas([COMPOSICAO]), parse_timeout=-1)
    grade = [["24-fev", "Físico", "UBER", "1/1", "20,00"], ["2-mar", "Virtual", "LIMPEZA", "1/1", "80,00"]]
    titulo = ["CARTAO EXEMPLO", "TOTAL FATURA 100,00"]
    doc("doc-composicao-grade", pdf_em_grade(grade, titulo=titulo))
    doc("doc-composicao-grade-quebrada", pdf_em_grade(grade, {(0, 2): "TRIP CENTRO"}, titulo=titulo))
    doc("doc-texto", pdf_de_paginas([TEXTO], largura=900))
    doc("doc-texto-sem-total", pdf_de_paginas([[x for x in TEXTO if "Total" not in x]], largura=900), openai_enabled=False, allow=False)
    doc("doc-texto-total-cartao", pdf_de_paginas([[x for x in TEXTO if "Total" not in x] + ["Total cartão final 1234: R$ 1.234,56"]], largura=900))
    doc("doc-texto-soma-errada", pdf_de_paginas([["Total da fatura 10,00", *TEXTO[2:]]], largura=900))
    doc("doc-texto-total-ilegivel", pdf_de_paginas([["Total fatura 1,2,3", *TEXTO[2:]]], largura=900))
    doc("doc-generica", pdf_de_paginas([GENERICA + ["Total da fatura 1.513,83"]]), "2026-01")
    doc("doc-nao-pdf", b"GIF89a fatura")
    doc("doc-paginas-demais", pdf_de_paginas([TEXTO] * 3), max_pages=2)
    doc("doc-pdf-sem-objetos", b"%PDF-1.4\n%%EOF")
    doc("doc-pdf-quebrado", b"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF")
    branco = pdf_em_branco()
    dois = pdf_em_branco(2)
    img = {"itens": [{"data": "2026-03-01", "descricao": "UBER", "valor": "20.00"}], "total": "20.00", "pendencias": ["Conferir descrição ilegível"]}
    j = lambda o: json.dumps(o, ensure_ascii=False)  # noqa: E731
    for enabled in (True, False):
        for allow in (True, False):
            sufixo = f"{'chave' if enabled else 'sem-chave'}-{'liberada' if allow else 'bloqueada'}"
            doc(f"doc-imagem-{sufixo}", branco, openai_enabled=enabled, allow=allow, respostas=r(j(img)))
    doc("doc-imagem-incompleta", branco, respostas=[{"content": j(img), "finish_reason": "length"}])
    doc("doc-imagem-filtro", branco, respostas=[{"content": j(img), "finish_reason": "content_filter"}])
    doc("doc-imagem-invalida", branco, respostas=r("não é json"))
    doc("doc-imagem-vazia", branco, respostas=r(""))
    doc("doc-imagem-lista", branco, respostas=r("[]"))
    doc("doc-imagem-sem-pendencias", branco, respostas=r(j({"itens": []})))
    doc("doc-imagem-itens-texto", branco, respostas=r(j({"itens": "x", "pendencias": []})))
    doc("doc-imagem-item-nao-objeto", branco, respostas=r(j({"itens": [1], "pendencias": []})))
    doc("doc-imagem-item-longo", branco, respostas=r(j({"itens": [{"data": "x", "descricao": "D" * 501, "valor": "1"}], "pendencias": []})))
    doc("doc-imagem-valor-longo", branco, respostas=r(j({"itens": [{"data": "x", "descricao": "D", "valor": "1" * 31}], "pendencias": []})))
    doc("doc-imagem-numeros", branco, respostas=r('{"itens": [{"data": 20260301, "descricao": 0, "valor": 20.5}, {"data": null, "valor": 0.0},'
                                                 ' {"valor": 1e16, "descricao": true}], "total": 20.5, "pendencias": [1.0, {"a": [1.5, "x"]}, null],'
                                                 ' "pagamentos_anteriores": "ab"}'))
    doc("doc-imagem-sem-itens", branco, respostas=r(j({"itens": [], "pendencias": [], "total": "1.00"})))
    doc("doc-imagem-sem-total", branco, respostas=r(j({**img, "total": None})))
    doc("doc-imagem-total-ilegivel", branco, respostas=r(j({**img, "total": "abc"})))
    doc("doc-imagem-anteriores-nulo", branco, respostas=r(j({**img, "pagamentos_anteriores": None})))
    doc("doc-imagem-anteriores-objeto", branco, respostas=r(j({**img, "pagamentos_anteriores": {"x": 1}})))
    doc("doc-imagem-pendencia-longa", branco, respostas=r(j({**img, "pendencias": ["P" * 600]})))
    doc("doc-imagem-duas-paginas", dois, respostas=r(j(img)) + r(j({**img, "total": "40.00", "pagamentos_anteriores": ["PAGAMENTO 01/03"]})))
    doc("doc-imagem-duas-paginas-mesmo-total", dois, respostas=r(j(img)) + r(j(img)))
    doc("doc-imagem-totais-escritos-diferente", dois, respostas=r(j({**img, "total": "20.00"})) + r(j({**img, "total": "20,00"})))
    doc("doc-imagem-segunda-incompleta", dois, respostas=r(j(img)) + [{"content": j(img), "finish_reason": "length"}])
    doc("doc-imagem-falha", branco, respostas=r(j(img)), falha=True)
    doc("doc-imagem-paginas-demais", pdf_em_branco(3), respostas=r(j(img)), max_ai_calls=2)
    doc("doc-imagem-tempo", branco, respostas=r(j(img)), vision_timeout=-1)
    doc("doc-imagem-texto-curto", pdf_de_paginas([["FATURA 1,00"]]), respostas=r(j(img)))
    doc("doc-imagem-competencia-unicode", branco, "٢٠٢٦-٠٤", respostas=r(j(img)))

    visao_direta(dm, "visao-ok", {"content": j(img), "finish_reason": "stop"})
    visao_direta(dm, "visao-incompleta", {"content": j(img), "finish_reason": "length"})
    visao_direta(dm, "visao-invalida", {"content": "{", "finish_reason": "stop"})
    visao_direta(dm, "visao-nula", {"content": None, "finish_reason": "stop"})
    visao_direta(dm, "visao-pendencias-texto", {"content": j({"itens": [], "pendencias": "x"}), "finish_reason": "stop"})
    visao_direta(dm, "visao-numero", {"content": "3", "finish_reason": "stop"})
    visao_direta(dm, "visao-falha", {"content": j(img), "finish_reason": "stop"}, falha=True)


def _tabelas_do_pdf(conteudo: bytes):
    """`page.extract_tables()` de cada página (o que a composição da fatura usa)."""
    import pdfplumber
    from io import BytesIO

    with pdfplumber.open(BytesIO(conteudo)) as pdf:
        return [p.extract_tables() for p in pdf.pages]


def tabelas_inventadas() -> list[bytes]:
    """Grades de todos os jeitos: traçadas com retângulos, com linhas soltas, preenchidas, quebradas, tortas."""
    import pymupdf

    saida = []
    grade = [["24-fev", "Físico", "UBER", "1/1", "20,00"], ["2-mar", "Virtual", "LIMPEZA GERAL", "", "80,00"],
             ["15-dez", "Fisico", "ASSINATURA", "2/3", "1.234,56"]]
    saida.append(pdf_em_grade(grade))
    saida.append(pdf_em_grade(grade, {(0, 2): "TRIP CENTRO", (2, 4): "R$", (1, 0): "x"}))
    # Só com linhas (`draw_line`), com vãos pequenos entre os traços e um traço curto demais.
    doc = pymupdf.open()
    p = doc.new_page()
    xs, ys = [40, 120, 200, 380, 450, 540], [100, 125, 150, 175]
    for y in ys:
        for a, b in zip(xs, xs[1:]):
            p.draw_line((a + 0.5, y + (0.4 if a == 200 else 0)), (b - 0.5, y), width=0.5)
    for x in xs:
        p.draw_line((x, ys[0]), (x, ys[-1] - 1.2), width=0.5)
    p.draw_line((300, 300), (301.5, 300))
    for i, linha in enumerate(grade):
        for j, cel in enumerate(linha):
            p.insert_text((xs[j] + 3, ys[i] + 15), cel, fontsize=8)
    saida.append(doc.tobytes())
    doc.close()
    # Fundo preenchido (sem traço) em linhas alternadas, uma célula mesclada e duas tabelas separadas.
    doc = pymupdf.open()
    p = doc.new_page()
    for i in range(4):
        p.draw_rect(pymupdf.Rect(40, 80 + i * 20, 300, 100 + i * 20), color=None, fill=(0.9, 0.9, 0.9) if i % 2 else (1, 1, 1), width=0)
        p.insert_text((45, 94 + i * 20), f"{i + 1}-jan Fisico COMPRA {i} {i + 1},00", fontsize=8)
    p.draw_rect(pymupdf.Rect(40, 300, 300, 330), color=(0, 0, 0))
    p.draw_rect(pymupdf.Rect(40, 330, 170, 360), color=(0, 0, 0))
    p.draw_rect(pymupdf.Rect(170, 330, 300, 360), color=(0, 0, 0))
    p.insert_text((45, 318), "MESCLADA", fontsize=8)
    p.insert_text((45, 348), "A", fontsize=8)
    p.insert_text((175, 348), "B", fontsize=8)
    p.draw_rect(pymupdf.Rect(350, 500, 450, 520), color=(0, 0, 0))
    p.draw_rect(pymupdf.Rect(450, 500, 550, 520), color=(0, 0, 0))
    p.insert_text((355, 514), "OUTRA", fontsize=8)
    saida.append(doc.tobytes())
    doc.close()
    # Traço diagonal, curva (círculo), polígono aberto e retângulo girado: não viram grade.
    doc = pymupdf.open()
    p = doc.new_page()
    p.draw_line((40, 40), (200, 120))
    p.draw_circle((300, 300), 40)
    p.draw_polyline([(50, 400), (150, 400), (150, 450)])
    p.draw_quad(pymupdf.Quad((300, 500), (360, 520), (290, 530), (350, 550)))
    p.insert_text((40, 700), "sem tabela 1,00", fontsize=8)
    saida.append(doc.tobytes())
    doc.close()
    # Página com caminho em matriz (cm) e grade de 2x2 desenhada dentro de `q ... Q`, e uma página em branco.
    doc = pymupdf.open()
    p = doc.new_page()
    p.insert_text((105, 335), "11-jan", fontsize=8)
    p.insert_text((165, 335), "9,99", fontsize=8)
    xref = p.get_contents()[0]
    extra = b"q 1 0 0 1 100 500 cm 0 0 60 20 re 60 0 60 20 re 0 20 60 20 re 60 20 60 20 re S Q\n"
    doc.update_stream(xref, doc.xref_stream(xref) + extra)
    doc.new_page()
    saida.append(doc.tobytes())
    doc.close()
    return saida


def _orcamento(pp):
    import time

    return pp._PDFBudget(deadline=time.monotonic() + 60, max_pages=120, ai_calls_restantes=30)


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_PASTA")
    if not pasta:
        return
    pp, dm = _modulos()
    for modulo in (pp, dm):
        for nome in dir(modulo):
            fn = getattr(modulo, nome)
            if getattr(fn, "__gabarito__", False):
                setattr(modulo, nome, fn.__wrapped__)
    # Os cenários da suíte: repetidos aqui com a entrada original (tem de dar o mesmo); os PDFs da suíte são
    # sintéticos (nenhum nome real dentro), então o cenário vai para o gabarito como está.
    for k, (conteudo, competencia, c, real) in enumerate(_CENARIOS_DA_SUITE):
        refeito = rodar_cenario(pp, dm, "documento", conteudo, competencia, c)
        refeito.pop("chamadas_ia")
        if refeito != real:
            raise AssertionError(f"o cenário refeito não repete a suíte:\n{refeito}\n{real}")
        limpo = {**c, "respostas": [{**x, "content": sanitizar_texto(x["content"])} for x in c["respostas"]]}
        # O PDF da suíte com a imagem da página tem 1,5 MB sem compressão: vai para o gabarito comprimido, desde
        # que a leitura dele dê o mesmo resultado.
        comprimido = _comprimir(conteudo)
        if comprimido is not None and len(comprimido) < len(conteudo):
            mesmo = rodar_cenario(pp, dm, "documento", comprimido, competencia, c)
            mesmo.pop("chamadas_ia")
            if mesmo == real:
                conteudo = comprimido
        cenario(pp, dm, "documento", f"suite-{k:02d}", conteudo, competencia, **limpo)
    rng = random.Random(20261123)
    chamadas_diretas(pp, dm, rng)
    cenarios_inventados(pp, dm)

    os.makedirs(pasta, exist_ok=True)
    for sha, conteudo in conteudos.items():
        with open(os.path.join(pasta, f"cartoes-{sha}{_ext(conteudo)}"), "wb") as f:
            f.write(conteudo)

    def trocar(v):
        if isinstance(v, dict) and "$arquivo" in v and isinstance(v["$arquivo"], str) and len(v) == 1:
            return {"$arquivo": f"cartoes-{v['$arquivo']}{_ext(conteudos[v['$arquivo']])}"}
        if isinstance(v, list):
            return [trocar(x) for x in v]
        return v

    for r in chamadas.values():
        r["args"] = trocar(r["args"])
    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], r.get("nome") or "", json.dumps(r["args"], ensure_ascii=False)))
    destino = os.path.join(pasta, "cartoes-chamadas.json")
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"ano_atual": ANO_FIXO, "chamadas": registros}, f, ensure_ascii=False, indent=0)
    por_fn: dict[str, int] = {}
    for r in registros:
        por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
    suite = sum(1 for r in registros if (r.get("nome") or "").startswith("suite-"))
    print(f"\ngabarito: {len(registros)} chamadas {por_fn} ({suite} cenários da suíte) -> {destino}")


def _comprimir(conteudo: bytes) -> bytes | None:
    import pymupdf

    try:
        with pymupdf.open(stream=conteudo, filetype="pdf") as doc:
            return doc.tobytes(garbage=4, deflate=True, deflate_images=True)
    except Exception:  # noqa: BLE001
        return None


def _ext(conteudo: bytes) -> str:
    return ".pdf" if conteudo[:4] == b"%PDF" else ".bin"


# ─── Conferência local ──────────────────────────────────────────────────────

def conferir(saida, competencia, arquivos):
    """Lê cada fatura com a IA desligada (`parse_pdf` e `ler_documento`) e grava só o resultado, sem o arquivo."""
    pp, dm = _modulos()
    c = {**PADRAO, "openai_enabled": False, "allow": False}
    resultado = {}
    for caminho in arquivos:
        with open(caminho, "rb") as f:
            conteudo = f.read()
        r = {"pdf": rodar_cenario(pp, dm, "pdf", conteudo, None, c), "documento": rodar_cenario(pp, dm, "documento", conteudo, competencia, c)}
        for v in r.values():
            v.pop("chamadas_ia")
        resultado[caminho] = r
    with open(saida, "w", encoding="utf-8") as f:
        json.dump({"competencia": competencia, "ano_atual": ANO_FIXO, "resultados": resultado}, f, ensure_ascii=False)
    print(f"{len(arquivos)} arquivo(s) -> {saida}")


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "conferir":
        sys.path.insert(0, os.getcwd())
        conferir(sys.argv[2], sys.argv[3], sys.argv[4:])
    else:
        print(__doc__)
        sys.exit(2)
