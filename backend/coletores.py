"""Coletores das fontes reais. Só biblioteca padrão.

Fontes (todas públicas, respeitando robots.txt):
  - PCI Concursos  /concursos/          → concursos com inscrições abertas, por UF
  - Diário Oficial da União (busca)     → editais, autorizações e sinais dos alvos
  - FGV Conhecimento /concursos         → concursos que a banca FGV organiza
  - Cesgranrio /concursos               → idem, banca Cesgranrio
Não coletamos da FCC (robots.txt proíbe /concursos/) nem da Vunesp (bloqueia robôs).
"""
import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime

import classificar as cl

UA = "Mozilla/5.0 (compatible; RadarConcursos/0.1; coleta de editais publicos)"
TODAS_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
             "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]


def baixar(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        cs = r.headers.get_content_charset() or "utf-8"
        return r.read().decode(cs, errors="replace")


def limpar(s):
    s = re.sub(r"<br\s*/?>", "\n", s or "", flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"[ \t\xa0]+", " ", html.unescape(s)).strip()


def data_br(s):
    try:
        return datetime.strptime(s.strip(), "%d/%m/%Y").date().isoformat()
    except Exception:
        return None


def hid(*partes):
    return hashlib.sha1("|".join(partes).encode()).hexdigest()[:12]


# ---------------------------------------------------------------- PCI Concursos
def pci(municipios_por_uf):
    h = baixar("https://www.pciconcursos.com.br/concursos/")
    partes = re.split(r'<div id="([A-Z]+)" class="ua">', h)
    out = []
    for i in range(1, len(partes), 2):
        secao, corpo = partes[i], partes[i + 1]
        for blk in re.findall(r'<div class="(?:da|na|ea)"[^>]*data-url="[^"]*"[^>]*>(.*?)<div class="clear">', corpo, re.S):
            a = re.search(r'<div class="ca"><a href="([^"]+)" title="([^"]*)"[^>]*>(.*?)</a>', blk, re.S)
            if not a:
                continue
            url, titulo, orgao = a.group(1), limpar(a.group(2)), limpar(a.group(3))
            cc = limpar((re.search(r'<div class="cc">(.*?)</div>', blk, re.S) or [None, ""])[1])
            cd_raw = (re.search(r'<div class="cd">(.*?)</div>', blk, re.S) or [None, ""])[1]
            ce = limpar((re.search(r'<div class="ce">(.*?)</div>', blk, re.S) or [None, ""])[1])
            linhas = [l.strip() for l in limpar(cd_raw).split("\n") if l.strip()]
            resumo = linhas[0] if linhas else ""
            cargo = linhas[1] if len(linhas) > 1 else "Vários cargos"
            escolaridade = linhas[2] if len(linhas) > 2 else ""
            datas = re.findall(r"\d{2}/\d{2}/\d{4}", ce)
            ufs = TODAS_UFS if secao == "NACIONAL" else [u for u in re.findall(r"\b[A-Z]{2}\b", cc) if u in TODAS_UFS] or [secao]
            esfera = cl.esfera_de(orgao + " " + titulo, secao)
            uf0 = ufs[0] if len(ufs) == 1 else None
            mun, mun_nome = cl.municipio_de(orgao, uf0, municipios_por_uf) if esfera in ("municipal", "estadual", "privada") else (None, None)
            if mun and esfera == "estadual":
                esfera = "municipal"
            area = cl.area_de(cargo, orgao, titulo)
            salario, vagas = cl.dinheiro(resumo), cl.inteiro(resumo)
            niveis = cl.niveis_de(escolaridade)
            out.append({
                "id": "pci-" + hid(url),
                "orgao": orgao, "sigla": cl.sigla_de(orgao), "titulo": titulo,
                "esfera": esfera, "tipo": cl.tipo_de(esfera),
                "ufs": ufs, "mun": mun, "munNome": mun_nome,
                "banca": None, "status": "edital_aberto",
                "publicado": None,
                "inscricoesAte": data_br(datas[-1]) if datas else None,
                "inscricoesDe": data_br(datas[0]) if len(datas) > 1 else None,
                "cargos": [{"nome": cargo, "nivel": n, "area": area, "salario": salario,
                            "vagas": vagas if i == 0 else 0} for i, n in enumerate(niveis)],
                "resumo": resumo,
                "url": url, "fonte": "PCI Concursos",
            })
    return out


# ---------------------------------------------------------------- Diário Oficial da União
RELEVANTE = re.compile(r"concurso|processo seletivo|provimento de (?:\d+ )?(?:cargos|vagas)", re.I)
RUIDO = re.compile(r"\bnomear\b|nomeia|exonera|aposenta|homolog|resultado final|torna sem efeito|prorroga[rç]?\w* (o )?prazo de validade"
                   r"|intima[çc][ãa]o|notifica[çc][ãa]o|licita[çc][ãa]o|preg[ãa]o|afastamento|posse|remo[çc][ãa]o|redistribui|vac[âa]ncia|cess[ãa]o", re.I)


def dou_sinais(termo, periodo="mes"):
    """Busca o nome do órgão no DOU e fica só com o que fala de concurso/edital/autorização (sem nomeações)."""
    out = []
    nt = cl.norm(termo)
    for x in dou(f'"{termo}"', periodo):
        txt = x["titulo"] + " " + x["texto"]
        autor = cl.norm(x["orgao"] + " " + x["titulo"])  # o órgão precisa ser quem publica, não só citado
        if nt in autor and RELEVANTE.search(txt) and not RUIDO.search(txt):
            x["termo"] = termo
            out.append(x)
    return out


def dou(consulta, periodo="semana"):
    """periodo: dia | semana | mes | ano. Use UMA frase entre aspas por consulta."""
    q = urllib.parse.quote_plus(consulta)
    url = f"https://www.in.gov.br/consulta/-/buscar/dou?q={q}&s=todos&exactDate={periodo}&sortType=0"
    h = baixar(url)
    m = re.search(r'BuscaDouPortlet_params"[^>]*>(.*?)</script>', h, re.S)
    if not m:
        return []
    itens = json.loads(m.group(1)).get("jsonArray", [])
    out = []
    for x in itens:
        link = "https://www.in.gov.br/web/dou/-/" + x.get("urlTitle", "")
        d = data_br(x.get("pubDate", "")) or datetime.now().date().isoformat()
        out.append({
            "id": "dou-" + hid(link), "fonte": "Diário Oficial da União",
            "titulo": limpar(x.get("title", "")), "orgao": x.get("hierarchyStr", ""),
            "texto": limpar(x.get("content", ""))[:400], "data": d, "url": link,
            "secao": x.get("pubName", ""),
        })
    return out


# ---------------------------------------------------------------- Bancas
def _links(h, base, filtro):
    vistos, out = set(), []
    for href, txt in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h, re.S):
        t = limpar(txt)
        if not t or not re.search(filtro, href):
            continue
        u = urllib.parse.urljoin(base, html.unescape(href))
        if u in vistos or len(t) < 6:
            continue
        vistos.add(u)
        out.append((u, t))
    return out


def fgv():
    h = baixar("https://conhecimento.fgv.br/concursos")
    out = []
    for u, t in _links(h, "https://conhecimento.fgv.br/", r"^/concursos?/[a-z0-9-]+$"):
        if "portfolio" in u:
            continue
        out.append({"id": "fgv-" + hid(u), "fonte": "FGV Conhecimento", "banca": "FGV", "titulo": t, "url": u,
                    "texto": f"FGV lista: {t}", "data": datetime.now().date().isoformat(), "orgao": t})
    return out


def cesgranrio():
    h = baixar("https://www.cesgranrio.org.br/concursos?id=index-205112&ucat=25")  # "em andamento"
    out = []
    for u, t in _links(h, "https://www.cesgranrio.org.br/", r"/concurso/[a-z0-9-]+/?$"):
        out.append({"id": "ces-" + hid(u), "fonte": "Cesgranrio", "banca": "Cesgranrio", "titulo": t, "url": u,
                    "texto": f"Cesgranrio lista: {t}", "data": datetime.now().date().isoformat(), "orgao": t})
    return out


def pausa():
    time.sleep(1.5)  # gentileza com os servidores
