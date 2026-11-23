"""Gabarito do leitor de comprovantes de pagamento, Bloco C, Fase C2 (19/11/2026).

Plugin do pytest: roda a suíte do original (dev41tech/contabil-core) que exercita o leitor de
comprovantes (`src/domain/comprovantes/pdf_parser.py`) e grava cada chamada de `_parse_valor`,
`_parse_data`, `_parse_por_regex`, `_parece_nota_fiscal`, `_comprovante_from_item` e
`_extrair_linhas`, com a entrada e a saída exatas. As leituras inteiras da suíte (`parse_pdf` e
`parse_imagem`) entram como CENÁRIO: o arquivo, o texto que a suíte pôs no lugar da extração (quando
ela troca `_extrair_linhas`), as chaves da IA, os limites e as respostas que a IA simulada da suíte
deu. O cenário é REPETIDO aqui, com a IA simulada por este plugin, primeiro com a entrada original (e
o resultado tem de ser o da suíte, senão o plugin aborta) e depois com a entrada sanitizada, que é a
que vai para o gabarito.

Depois acrescenta casos inventados com semente fixa: PDFs de comprovante gerados aqui (PIX, TED,
boleto, nota fiscal, várias páginas, em branco), linhas de rótulo de todos os jeitos, valores, datas,
itens da IA e cenários para cada ramo (as quatro combinações das chaves da IA, o orçamento esgotado,
a página que traz o valor, a nota reconhecida pela IA, a falha do provedor). A IA de verdade nunca é
chamada.

O porte em TypeScript repete as chamadas (`src/lib/contabil-core/comprovantes/leitor.test.ts`).

Dados: os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."), fora do git, são trocados, e os
CNPJs que não são de exemplo viram fictícios começando com 9 (`gabarito_cruzamento.sanitizar_texto`).

Uso, a partir da raiz do contabil-core (com pdfplumber, PyMuPDF e pytest):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_PASTA=<connect>/src/lib/contabil-core/comprovantes/gabarito \\
        python -I -W ignore -m pytest -q -p gabarito_comprovantes tests/unit/test_comprovantes_pdf_parser.py

Conferência local em arquivos reais (a saída fica FORA do repositório, só com os resultados):
    python -I -W ignore <connect>/scripts/contabil-core/gabarito_comprovantes.py conferir <saida.json> <arquivo>...
"""
from __future__ import annotations

import dataclasses
import functools
import hashlib
import json
import os
import random
import sys
from datetime import UTC, datetime
from decimal import Decimal

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gabarito_cruzamento import sanitizar_texto  # noqa: E402

chamadas: dict[str, dict] = {}
conteudos: dict[str, bytes] = {}
_CENARIOS_DA_SUITE: list[tuple[bytes, dict, dict]] = []
_ESTADO = {"dentro": 0}


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
    return v


def codificar(v):
    if isinstance(v, int) and not isinstance(v, bool) and abs(v) > 2**53:
        return {"$int": str(v)}
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        return {"$f": repr(v)}
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    if isinstance(v, datetime):
        return {"$dt": v.isoformat()}
    if isinstance(v, bytes):
        sha = hashlib.sha256(v).hexdigest()[:12]
        conteudos.setdefault(sha, v)
        return {"$arquivo": sha}
    if isinstance(v, (list, tuple)):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        return {"$dict": [[str(k), codificar(x)] for k, x in v.items()]}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return {f.name: codificar(getattr(v, f.name)) for f in dataclasses.fields(v)}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


def _registrar(nome, fn, args, kwargs=None, extra=None):
    kwargs = kwargs or {}
    entrada = {"fn": nome, "args": codificar(list(args)), "kwargs": codificar(kwargs)}
    try:
        entrada["result"] = codificar(fn(*args, **kwargs))
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    if extra:
        entrada.update(extra(entrada))
    chave = json.dumps([entrada["fn"], entrada["args"], entrada["kwargs"], entrada.get("nome")], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)
    return entrada


def _modulo():
    sys.path.insert(0, os.getcwd())
    from src.domain.comprovantes import pdf_parser

    return pdf_parser


_PURAS = ("_parse_valor", "_parse_data", "_parse_por_regex", "_parece_nota_fiscal", "_comprovante_from_item")


def envolver(modulo, nome_fn):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        try:
            return original(*args, **kwargs)
        finally:
            if _ESTADO["dentro"] == 0:
                _registrar(f"leitor.{nome_fn}", original, sanitizar(list(args)), sanitizar(kwargs))

    gravador.__gabarito__ = True
    setattr(modulo, nome_fn, gravador)


# ─── A IA simulada e o cenário ──────────────────────────────────────────────

class _Segredo:
    def get_secret_value(self):
        return "sk-gabarito"


class _Config:
    def __init__(self, c: dict):
        self.openai_enabled = c["openai_enabled"]
        self.allow_financial_data_to_openai = c["allow"]
        self.openai_api_key = _Segredo() if c["openai_enabled"] else None
        self.pdf_parse_timeout_seconds = 60
        self.pdf_max_pages = c["max_pages"]
        self.pdf_max_ai_calls = c["max_ai_calls"]


def rodar_cenario(pp, conteudo: bytes, c: dict) -> dict:
    """`parse_pdf`/`parse_imagem` com a configuração, o texto e as respostas de `c`; devolve a saída."""
    import openai

    feitas = []
    filas = {k: list(v) for k, v in c["respostas"].items()}

    class Completions:
        def create(self, *, model, messages, **kw):
            usuario = messages[1]["content"]
            if isinstance(usuario, str):
                feitas.append({"tipo": "texto", "modelo": model, "texto": usuario, "sistema": messages[0]["content"]})
                if c.get("falha_texto"):
                    raise RuntimeError("falha simulada do provedor")
            else:
                url = usuario[0]["image_url"]["url"]
                feitas.append({"tipo": "visao", "modelo": model, "mime": url.split(";")[0][5:], "prompt": usuario[1]["text"],
                               "sistema": messages[0]["content"]})
                if c.get("falha_visao"):
                    raise RuntimeError("falha simulada do provedor")
            fila = filas.get(model) or [""]
            texto = fila.pop(0) if len(fila) > 1 else fila[0]

            class R:
                choices = [type("C", (), {"message": type("M", (), {"content": texto})()})()]

            return R()

    class Cliente:
        def __init__(self, api_key=None):
            self.chat = type("Chat", (), {"completions": Completions()})()

    guardados = (openai.OpenAI, pp.get_settings, pp._extrair_linhas)
    openai.OpenAI = Cliente
    pp.get_settings = lambda: _Config(c)
    if c.get("linhas") is not None:
        pp._extrair_linhas = lambda _conteudo, _budget: (list(c["linhas"]), c["total"])
    _ESTADO["dentro"] += 1
    saida: dict = {}
    try:
        try:
            if c["tipo"] == "pdf":
                r = pp.parse_pdf(conteudo)
            else:
                r = pp.parse_imagem(conteudo, c["mime"])
            saida["result"] = codificar(r)
        except Exception as exc:  # noqa: BLE001
            saida["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    finally:
        _ESTADO["dentro"] -= 1
        openai.OpenAI, pp.get_settings, pp._extrair_linhas = guardados
    saida["chamadas_ia"] = feitas
    return saida


def cenario(pp, nome: str, conteudo: bytes, **c) -> None:
    config = {"tipo": "pdf", "mime": "image/png", "openai_enabled": True, "allow": True, "max_pages": 120, "max_ai_calls": 30,
              "respostas": {}, "falha_texto": False, "falha_visao": False, "linhas": None, "total": None, **c}
    saida = rodar_cenario(pp, conteudo, config)
    entrada = {"fn": "leitor.cenario", "nome": nome, "args": [codificar(conteudo), config], "kwargs": {}, **saida}
    chave = json.dumps(["cenario", nome], ensure_ascii=False)
    chamadas.setdefault(chave, entrada)


def _instalar_captura(pp) -> None:
    """Grava as leituras inteiras da suíte (`parse_pdf` e `parse_imagem`) como cenários."""
    import openai

    for nome_fn in ("parse_pdf", "parse_imagem"):
        original = getattr(pp, nome_fn)
        if getattr(original, "__gabarito__", False):
            continue

        def fazer(original=original, nome_fn=nome_fn):
            @functools.wraps(original)
            def captura(conteudo, *args, **kwargs):
                if _ESTADO["dentro"]:
                    return original(conteudo, *args, **kwargs)
                s = pp.get_settings()
                linhas_lidas: list = []
                extrair = pp._extrair_linhas
                trocado = not getattr(extrair, "__original__", False)

                def extrair_gravando(conteudo_, budget):
                    r = extrair(conteudo_, budget)
                    linhas_lidas.append(r)
                    return r

                respostas: dict[str, list[str]] = {}
                falhou_texto = []
                cliente_da_suite = openai.OpenAI

                def cliente(api_key=None):
                    real = cliente_da_suite(api_key=api_key)
                    criar = real.chat.completions.create

                    def create(**kw):
                        try:
                            r = criar(**kw)
                        except Exception:
                            falhou_texto.append(kw["model"])
                            raise
                        respostas.setdefault(kw["model"], []).append(r.choices[0].message.content)
                        return r

                    real.chat.completions.create = create
                    return real

                pp._extrair_linhas = extrair_gravando
                openai.OpenAI = cliente
                _ESTADO["dentro"] += 1
                real: dict = {}
                try:
                    try:
                        r = original(conteudo, *args, **kwargs)
                        real["result"] = codificar(r)
                        return r
                    except Exception as exc:
                        real["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
                        raise
                finally:
                    _ESTADO["dentro"] -= 1
                    pp._extrair_linhas = extrair
                    openai.OpenAI = cliente_da_suite
                    config = {
                        "tipo": "pdf" if nome_fn == "parse_pdf" else "imagem",
                        "mime": (args[0] if args else kwargs.get("content_type", "image/png")) if nome_fn == "parse_imagem" else "image/png",
                        "openai_enabled": bool(s.openai_enabled), "allow": bool(s.allow_financial_data_to_openai),
                        "max_pages": s.pdf_max_pages, "max_ai_calls": s.pdf_max_ai_calls,
                        "respostas": respostas, "falha_texto": bool(falhou_texto), "falha_visao": False,
                        "linhas": list(linhas_lidas[0][0]) if (trocado and linhas_lidas) else None,
                        "total": linhas_lidas[0][1] if (trocado and linhas_lidas) else None,
                    }
                    _CENARIOS_DA_SUITE.append((conteudo, config, real))

            captura.__gabarito__ = True
            return captura

        setattr(pp, nome_fn, fazer())
    pp._extrair_linhas.__original__ = True


def pytest_configure(config):  # noqa: ARG001
    pp = _modulo()
    for fn in _PURAS:
        envolver(pp, fn)
    _instalar_captura(pp)


# ─── PDFs e casos inventados ────────────────────────────────────────────────

def pdf_de_paginas(paginas: list[list[str]]) -> bytes:
    import fitz

    doc = fitz.open()
    for linhas in paginas:
        pagina = doc.new_page()
        y = 72
        for linha in linhas:
            if linha:
                pagina.insert_text((72, y), linha, fontsize=10)
            y += 14
    dados = doc.tobytes()
    doc.close()
    return dados


def png_ficticio() -> bytes:
    import fitz

    doc = fitz.open()
    pagina = doc.new_page(width=120, height=60)
    pagina.insert_text((10, 30), "PIX")
    dados = pagina.get_pixmap().tobytes("png")
    doc.close()
    return dados


PIX = [
    "Comprovante de Pagamento Pix",
    "Valor: R$ 1.234,56",
    "Realizado em: 13/05/2026 - 09:33:52",
    "Nome do destinatário: FORNECEDOR EXEMPLO LTDA",
    "CNPJ do destinatário: 12.345.678/0001-95",
    "Nome do pagador: EMPRESA EXEMPLO LTDA",
]
BOLETO = [
    "Comprovante de pagamento de boleto",
    "Beneficiário: DISTRIBUIDORA EXEMPLO S/A",
    "CNPJ: 11.111.111/0001-91",
    "Vencimento: 01/03/2026",
    "Valor do documento: R$ 500,00",
    "Juros: R$ 5,00",
    "Multa: R$ 10,00",
    "Desconto: R$ 0,00",
    "Valor pago: R$ 515,00",
    "Data do pagamento: 02/03/2026",
]
TED = [
    "Comprovante de transferência",
    "Favorecido",
    "MERCADO CENTRAL LTDA",
    "CPF/CNPJ",
    "123.456.789-09",
    "Valor da transferência",
    "R$ 89,90",
    "Data da transação",
    "10/02/26",
]
NFSE = [
    "PREFEITURA MUNICIPAL DE EXEMPLO",
    "NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e",
    "PRESTADOR DE SERVIÇOS",
    "TOMADOR DE SERVIÇOS",
    "VALOR TOTAL DA NOTA = R$ 1.245,00",
]
SEM_ROTULO = ["Comprovante", "Quantia transferida R$ 10,00", "Operação concluída com sucesso"]

ITEM = {
    "tipo_documento": "comprovante_pagamento", "favorecido": "JOAO DA SILVA", "cpf_cnpj": "123.456.789-00", "valor_pago": 150.00,
    "valor_documento": None, "data_pagamento": "05/01/2026", "data_vencimento": None, "juros": None, "multa": None, "desconto": None,
}


def chamadas_diretas(pp, rng: random.Random) -> None:
    D = Decimal
    for v in ["1.234,56", "R$ 89,90", "R$\xa01.000,00", "-5,00", "(5,00)", "--(7,10)", "1,234.56", "1.234", "1,5", "abc", "", "  ",
              "R$", "1_000,00", "١٢٣,٤٥", "+3,00", "0,00", "-0,00", "1.234.567.890.123.456.789.012.345.678,99",
              "-1.234.567.890.123.456.789.012.345.678,99", "Infinity", "-nan", "NaN12", "1e3", "12,345,67", "R$ 1 234,56", "(12,00"]:
        _registrar("leitor._parse_valor", pp._parse_valor, [v])
    for v in ["05/01/2026", "05/01/26", "5/1/2026", "31/02/2026", "29/02/2024", "00/01/2026", "05/13/2026", "05/01/0000",
              "05/01/202", " 13/05/2026 - 09:33", "13-05-2026", "", "٠٥/٠١/٢٠٢٦", "05/01/20261", "05/01/99"]:
        _registrar("leitor._parse_data", pp._parse_data, [v])
    blocos = [PIX, BOLETO, TED, NFSE, SEM_ROTULO,
              ["Valor", "R$ 1.234,56"], ["Valor:", "R$ 80,00"], ["Valor -", "R$ 1,00"], ["VALOR TOTAL R$ 9,99"],
              ["Valor do IOF: R$ 0,38", "Valor pago: R$ 500,00"], ["Valor do documento: R$ 10,00", "Valor pago R$ 11,00"],
              ["Valor do documento", "Valor pago: R$ 3,00"], ["Pago a FULANO DE TAL", "valor cobrado 7,00"],
              ["Favorecido:", "", "BELTRANO"], ["Favorecido: - : ", "BELTRANO"], ["Recebedor"], ["CPF", "123.456.789-09"],
              ["CNPJ/CPF: 12345678000195"], ["CPF/CNPJ 12345678909 e 98765432100"], ["Vencimento 01/02/2026 pago em 03/02/2026"],
              ["Efetivado em", "03/02/2026"], ["Data de crédito 04/02/26"], ["juros multa desconto", "R$ 1,00"],
              ["Jurosé R$ 1,00", "Multa: -R$ 2,00"], ["Desconto: (3,00)"], ["Total pago R$ 1.000.000,00"],
              ["  Valor  ", "  R$ 5,00  "], ["Valor a pagar R$ 61,20"], ["valor enviado", "42,00"], ["Valor da transação 1,00"],
              ["Valor do Pix R$ 250,00"], ["valor do documento pago 9,00"], ["Valor nominal 100,00", "Valor de face 200,00"],
              ["Favorecido: " + "X" * 400], ["CPF: 123.456.789-0912345678000195"], [""], [], ["VALOR", "R$ ١٢٣,٤٥"],
              ["Nome do destinatário: ÇÃO LTDA"], ["Beneficiario: ACENTO SEM"], ["realizado em 01/01/2026", "Valor: 1.000,00"]]
    palavras = ["Valor", "pago", "Favorecido:", "CPF", "CNPJ:", "Vencimento", "Juros", "Multa", "Desconto", "R$", "1.234,56", "10,00",
                "05/01/2026", "12.345.678/0001-95", "123.456.789-09", "Pago em", "Data do pagamento", "total", "documento", "-", ":"]
    for _ in range(120):
        linhas = [" ".join(rng.choice(palavras) for _ in range(rng.randint(1, 5))) for _ in range(rng.randint(1, 8))]
        blocos.append(linhas)
    for b in blocos:
        _registrar("leitor._parse_por_regex", pp._parse_por_regex, [b])
    notas = [NFSE, PIX, ["DANFSe v1.0"], ["danfe"], ["Documento auxiliar da NF-e"], ["https://nfe.prefeitura.sp.gov.br/x/notaprint.aspx"],
             ["nfse.gov.br"], ["Prestador", "Tomador"], ["prestadores"], ["NFS-e", "Prestador"], ["Nota Fiscal de Serviço", "tomador"],
             ["Nota fiscal eletrônica de serviços"], ["Pagamento NF 1234"], ["xDANFE"], ["DANFEs"], ["NFSe tomadora"],
             ["Nota fiscal eletronica de servicos", "PRESTADOR"], ["prestação de serviço ao tomador"]]
    for b in notas:
        _registrar("leitor._parece_nota_fiscal", pp._parece_nota_fiscal, [b])
    itens = [
        dict(ITEM), {}, dict(ITEM, favorecido=None), dict(ITEM, favorecido=""), dict(ITEM, favorecido=12), dict(ITEM, favorecido="F" * 400),
        dict(ITEM, cpf_cnpj="12.345.678/0001-95 e mais"), dict(ITEM, cpf_cnpj=0), dict(ITEM, valor_pago=None), dict(ITEM, valor_pago=""),
        dict(ITEM, valor_pago="1.234,56"), dict(ITEM, valor_pago=" 15.5 "), dict(ITEM, valor_pago=D("1E+3")), dict(ITEM, valor_pago=0),
        dict(ITEM, valor_pago=False), dict(ITEM, valor_pago=True), dict(ITEM, valor_pago=float("nan")), dict(ITEM, valor_pago=float("inf")),
        dict(ITEM, valor_pago=[1]), dict(ITEM, valor_pago="1_000"), dict(ITEM, valor_pago=D("150.00")), dict(ITEM, valor_pago=-3),
        dict(ITEM, data_pagamento="5/1/2026"), dict(ITEM, data_pagamento="31/02/2026"), dict(ITEM, data_pagamento=0),
        dict(ITEM, data_pagamento="05/01/26 10:00"), dict(ITEM, data_vencimento="01/02/2026"), dict(ITEM, juros=D("1.5"), multa="2", desconto=0),
        {"valor_pago": 1}, {"tipo_documento": "nota_fiscal"},
    ]
    for item in itens:
        _registrar("leitor._comprovante_from_item", pp._comprovante_from_item, [item, "ia"])


def cenarios_inventados(pp) -> None:
    item = json.dumps(ITEM)
    sem_valor = json.dumps(dict(ITEM, valor_pago=None))
    nota = json.dumps(dict(ITEM, tipo_documento="nota_fiscal"))
    png = png_ficticio()
    for tipo, linhas in (("pix", PIX), ("boleto", BOLETO), ("ted", TED)):
        cenario(pp, f"pdf-{tipo}", pdf_de_paginas([linhas]))
        cenario(pp, f"pdf-{tipo}-ia-desligada", pdf_de_paginas([linhas]), openai_enabled=False, allow=False)
    cenario(pp, "pdf-duas-paginas", pdf_de_paginas([PIX[:3], PIX[3:]]))
    cenario(pp, "pdf-nfse", pdf_de_paginas([NFSE]))
    for enabled in (True, False):
        for allow in (True, False):
            sufixo = f"{'chave' if enabled else 'sem-chave'}-{'liberada' if allow else 'bloqueada'}"
            cenario(pp, f"pdf-sem-rotulo-{sufixo}", pdf_de_paginas([SEM_ROTULO]), openai_enabled=enabled, allow=allow,
                    respostas={"gpt-4o-mini": [sem_valor]})
            cenario(pp, f"pdf-em-branco-{sufixo}", pdf_de_paginas([[]]), openai_enabled=enabled, allow=allow,
                    respostas={"gpt-4o": [sem_valor]})
            cenario(pp, f"imagem-{sufixo}", png, tipo="imagem", openai_enabled=enabled, allow=allow, respostas={"gpt-4o": [sem_valor]})
    cenario(pp, "pdf-sem-rotulo-ia-acha", pdf_de_paginas([SEM_ROTULO]), respostas={"gpt-4o-mini": [item]})
    cenario(pp, "pdf-sem-rotulo-ia-cercada", pdf_de_paginas([SEM_ROTULO]), respostas={"gpt-4o-mini": ["```json\n" + item + "\n```"]})
    cenario(pp, "pdf-sem-rotulo-ia-nota", pdf_de_paginas([SEM_ROTULO]), respostas={"gpt-4o-mini": [nota]})
    cenario(pp, "pdf-sem-rotulo-ia-lixo", pdf_de_paginas([SEM_ROTULO]), respostas={"gpt-4o-mini": ["não sei"]})
    cenario(pp, "pdf-sem-rotulo-falha", pdf_de_paginas([SEM_ROTULO]), respostas={"gpt-4o-mini": [item]}, falha_texto=True)
    cenario(pp, "pdf-sem-rotulo-sem-chamadas", pdf_de_paginas([SEM_ROTULO]), respostas={"gpt-4o-mini": [item]}, max_ai_calls=0)
    cenario(pp, "pdf-em-branco-acha", pdf_de_paginas([[]]), respostas={"gpt-4o": [item]})
    cenario(pp, "pdf-em-branco-nota", pdf_de_paginas([[]]), respostas={"gpt-4o": [nota]})
    cenario(pp, "pdf-em-branco-segunda", pdf_de_paginas([[], []]), respostas={"gpt-4o": [sem_valor, item]})
    cenario(pp, "pdf-em-branco-tres-erram", pdf_de_paginas([[], [], []]), respostas={"gpt-4o": [sem_valor, "{}", "[]"]})
    cenario(pp, "pdf-em-branco-chamadas-esgotadas", pdf_de_paginas([[]] * 4), respostas={"gpt-4o": [sem_valor]}, max_ai_calls=3)
    cenario(pp, "pdf-paginas-demais", pdf_de_paginas([["x"]] * 6), respostas={"gpt-4o": [item]}, max_pages=5)
    cenario(pp, "pdf-em-branco-paginas-demais", pdf_de_paginas([[]] * 6), respostas={"gpt-4o": [item]}, max_pages=5)
    cenario(pp, "pdf-texto-curto", pdf_de_paginas([["PIX 10"]]), respostas={"gpt-4o": [item]})
    cenario(pp, "pdf-em-branco-falha-visao", pdf_de_paginas([[]]), respostas={"gpt-4o": [item]}, falha_visao=True)
    cenario(pp, "imagem-acha", png, tipo="imagem", respostas={"gpt-4o": [item]})
    cenario(pp, "imagem-jpeg", png, tipo="imagem", mime="image/jpeg", respostas={"gpt-4o": [item]})
    cenario(pp, "imagem-nota", png, tipo="imagem", respostas={"gpt-4o": [nota]})
    cenario(pp, "imagem-vazia", png, tipo="imagem", respostas={"gpt-4o": ["{}"]})
    cenario(pp, "imagem-sem-chamadas", png, tipo="imagem", respostas={"gpt-4o": [item]}, max_ai_calls=0)
    cenario(pp, "imagem-falha", png, tipo="imagem", respostas={"gpt-4o": [item]}, falha_visao=True)
    longas = ["LINHA %04d " % i + "Y" * 120 for i in range(400)]
    cenario(pp, "texto-longo", b"%PDF-1.4 qualquer", linhas=longas, total=sum(len(x) for x in longas), respostas={"gpt-4o-mini": [item]})
    for nome, dados in (("pdf-sem-objetos", b"%PDF-1.4\n%%EOF"), ("pdf-vazio", b"")):
        for ligada in (True, False):
            cenario(pp, f"{nome}-{'ligada' if ligada else 'desligada'}", dados, openai_enabled=ligada, allow=ligada,
                    respostas={"gpt-4o": [item]})
    for k, linhas in enumerate([PIX, BOLETO, TED, NFSE, SEM_ROTULO, PIX[:2] + NFSE[2:4]]):
        pdf = pdf_de_paginas([linhas, linhas[::-1]])
        _registrar("leitor._extrair_linhas", lambda c: pp._extrair_linhas(c, _orcamento(pp)), [pdf])


def _orcamento(pp):
    import time

    return pp._PDFBudget(deadline=time.monotonic() + 60, max_pages=120, ai_calls_restantes=30)


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_PASTA")
    if not pasta:
        return
    pp = _modulo()
    for nome in dir(pp):
        fn = getattr(pp, nome)
        if getattr(fn, "__gabarito__", False):
            setattr(pp, nome, fn.__wrapped__)
    # Os cenários da suíte: repetidos aqui com a entrada original (tem de dar o mesmo) e sanitizada.
    for k, (conteudo, c, real) in enumerate(_CENARIOS_DA_SUITE):
        refeito = rodar_cenario(pp, conteudo, c)
        refeito.pop("chamadas_ia")
        if refeito != real:
            raise AssertionError(f"o cenário refeito não repete a suíte:\n{refeito}\n{real}")
        limpo = {**c, "respostas": {m: [sanitizar_texto(x) for x in v] for m, v in c["respostas"].items()},
                 "linhas": sanitizar(c["linhas"]) if c["linhas"] is not None else None}
        if limpo["linhas"] is not None:
            limpo["total"] = c["total"] if limpo["linhas"] == c["linhas"] else sum(len(x) for x in limpo["linhas"])
        cenario(pp, f"suite-{k:02d}", conteudo, **{x: y for x, y in limpo.items()})
        # O cenário da suíte que tinha texto real: o `total` da suíte pode não ser a soma das linhas.
    rng = random.Random(20261119)
    chamadas_diretas(pp, rng)
    cenarios_inventados(pp)

    for sha, conteudo in conteudos.items():
        ext = ".pdf" if conteudo[:4] == b"%PDF" else ".png" if conteudo[:4] == b"\x89PNG" else ".bin"
        with open(os.path.join(pasta, f"comprovantes-{sha}{ext}"), "wb") as f:
            f.write(conteudo)

    def trocar(v):
        if isinstance(v, dict) and "$arquivo" in v:
            conteudo = conteudos[v["$arquivo"]]
            ext = ".pdf" if conteudo[:4] == b"%PDF" else ".png" if conteudo[:4] == b"\x89PNG" else ".bin"
            return {"$arquivo": f"comprovantes-{v['$arquivo']}{ext}"}
        if isinstance(v, list):
            return [trocar(x) for x in v]
        return v

    for r in chamadas.values():
        r["args"] = trocar(r["args"])
    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], r.get("nome") or "", json.dumps(r["args"], ensure_ascii=False)))
    destino = os.path.join(pasta, "comprovantes-chamadas.json")
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"gerado_em": datetime.now(UTC).replace(microsecond=0).isoformat(), "chamadas": registros}, f, ensure_ascii=False, indent=0)
    por_fn: dict[str, int] = {}
    for r in registros:
        por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
    suite = sum(1 for r in registros if (r.get("nome") or "").startswith("suite-"))
    print(f"\ngabarito: {len(registros)} chamadas {por_fn} ({suite} cenários da suíte) -> {destino}")


# ─── Conferência local ──────────────────────────────────────────────────────

def conferir(saida, arquivos):
    """Lê cada arquivo com a IA desligada (só as camadas locais) e grava o resultado, sem o arquivo."""
    pp = _modulo()
    resultado = {}
    c = {"tipo": "pdf", "mime": "image/png", "openai_enabled": False, "allow": False, "max_pages": 120, "max_ai_calls": 30,
         "respostas": {}, "linhas": None, "total": None}
    for caminho in arquivos:
        with open(caminho, "rb") as f:
            conteudo = f.read()
        nome = caminho.lower()
        tipo = "imagem" if nome.endswith((".png", ".jpg", ".jpeg")) else "pdf"
        mime = "image/jpeg" if nome.endswith((".jpg", ".jpeg")) else "image/png"
        r = rodar_cenario(pp, conteudo, {**c, "tipo": tipo, "mime": mime})
        r.pop("chamadas_ia")
        if tipo == "pdf":
            try:
                linhas, total = pp._extrair_linhas(conteudo, _orcamento(pp))
                r["linhas"] = {"linhas": linhas, "total": total}
            except Exception as exc:  # noqa: BLE001
                r["linhas"] = {"error": str(exc)}
        resultado[caminho] = r
    with open(saida, "w", encoding="utf-8") as f:
        json.dump({"resultados": resultado}, f, ensure_ascii=False)
    print(f"{len(arquivos)} arquivo(s) -> {saida}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "conferir":
        sys.path.insert(0, os.getcwd())
        conferir(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__)
        sys.exit(2)
