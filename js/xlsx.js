// Planilhas Excel (.xlsx) sem bibliotecas: gera e lê arquivos simples (só valores, sem fórmulas).
// Um .xlsx é um ZIP de arquivos XML. A gravação usa ZIP sem compressão; a leitura aceita
// arquivos comprimidos do Excel/LibreOffice/Google Planilhas via DecompressionStream.

const enc = new TextEncoder();

// ---------- ZIP ----------
const TABELA_CRC = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(arquivos) {
  const partes = [];
  const central = [];
  let pos = 0;
  arquivos.forEach(function (a) {
    const nome = enc.encode(a.nome);
    const dados = typeof a.dados === 'string' ? enc.encode(a.dados) : a.dados;
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    partes.push(new Uint8Array(local.buffer), nome, dados);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, pos, true);
    central.push(new Uint8Array(c.buffer), nome);
    pos += 30 + nome.length + dados.length;
  });
  const tamCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, pos, true);
  return new Blob(partes.concat(central, [new Uint8Array(fim.buffer)]), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

async function descompactar(buffer) {
  const v = new DataView(buffer);
  let fimPos = -1;
  for (let i = buffer.byteLength - 22; i >= 0; i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fimPos = i; break; }
  }
  if (fimPos < 0) throw new Error('O arquivo não é uma planilha .xlsx válida.');
  const qtd = v.getUint16(fimPos + 10, true);
  let p = v.getUint32(fimPos + 16, true);
  const dec = new TextDecoder();
  const arquivos = {};
  for (let n = 0; n < qtd; n++) {
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const tamNome = v.getUint16(p + 28, true);
    const tamExtra = v.getUint16(p + 30, true);
    const tamComent = v.getUint16(p + 32, true);
    const posLocal = v.getUint32(p + 42, true);
    const nome = dec.decode(new Uint8Array(buffer, p + 46, tamNome));
    const inicioDados = posLocal + 30 + v.getUint16(posLocal + 26, true) + v.getUint16(posLocal + 28, true);
    const bruto = new Uint8Array(buffer, inicioDados, tamComp);
    arquivos[nome] = { metodo: metodo, bruto: bruto };
    p += 46 + tamNome + tamExtra + tamComent;
  }
  return {
    texto: async function (nome) {
      const a = arquivos[nome];
      if (!a) return null;
      if (a.metodo === 0) return dec.decode(a.bruto);
      if (a.metodo !== 8) throw new Error('Compressão não suportada na planilha.');
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Este navegador é antigo demais para ler planilhas compactadas. Atualize o navegador ou importe pelo computador.');
      }
      const fluxo = new Blob([a.bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(fluxo).arrayBuffer());
    }
  };
}

// ---------- Gravação ----------
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function letraColuna(i) {
  let s = '';
  i++;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function xmlPlanilha(aba) {
  const larguras = aba.larguras || [];
  const cols = larguras.length ? '<cols>' + larguras.map(function (w, i) {
    return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
  }).join('') + '</cols>' : '';
  const linhas = aba.linhas.map(function (linha, r) {
    return '<row r="' + (r + 1) + '">' + linha.map(function (v, c) {
      if (v === null || v === undefined || v === '') return '';
      const ref = letraColuna(c) + (r + 1);
      const estilo = r === 0 && aba.cabecalho !== false ? ' s="1"' : '';
      if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + estilo + '><v>' + v + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr"' + estilo + '><is><t xml:space="preserve">' + escXml(v) + '</t></is></c>';
    }).join('') + '</row>';
  }).join('');
  const congelar = aba.cabecalho !== false
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    congelar + cols + '<sheetData>' + linhas + '</sheetData></worksheet>';
}

// abas: [{ nome, linhas: [[...cabeçalho], [...], ...], larguras?: [números], cabecalho?: false }]
export function gerarXlsx(abas) {
  const arquivos = [
    { nome: '[Content_Types].xml', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      abas.map(function (a, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') + '</Types>' },
    { nome: '_rels/.rels', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>' },
    { nome: 'xl/workbook.xml', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      abas.map(function (a, i) {
        return '<sheet name="' + escXml(a.nome.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
      }).join('') + '</sheets></workbook>' },
    { nome: 'xl/_rels/workbook.xml.rels', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      abas.map(function (a, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('') +
      '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' },
    { nome: 'xl/styles.xml', dados: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>' }
  ];
  abas.forEach(function (a, i) { arquivos.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', dados: xmlPlanilha(a) }); });
  return zip(arquivos);
}

// ---------- Leitura ----------
function filhos(no, nome) {
  return Array.prototype.filter.call(no.getElementsByTagName('*'), function (e) { return e.localName === nome; });
}

function indiceColuna(ref) {
  const letras = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n - 1;
}

// Devolve { nomeDaAba: [[célula, ...], ...] } com textos e números.
export async function lerXlsx(buffer) {
  const z = await descompactar(buffer);
  const parser = new DOMParser();
  const xml = function (s) { return parser.parseFromString(s, 'application/xml'); };

  const wb = await z.texto('xl/workbook.xml');
  if (!wb) throw new Error('O arquivo não é uma planilha .xlsx válida.');
  const rels = xml((await z.texto('xl/_rels/workbook.xml.rels')) || '<r/>');
  const alvos = {};
  filhos(rels, 'Relationship').forEach(function (r) { alvos[r.getAttribute('Id')] = r.getAttribute('Target'); });

  const compartilhadas = [];
  const ss = await z.texto('xl/sharedStrings.xml');
  if (ss) {
    filhos(xml(ss), 'si').forEach(function (si) {
      compartilhadas.push(filhos(si, 't').map(function (t) { return t.textContent; }).join(''));
    });
  }

  const resultado = {};
  for (const aba of filhos(xml(wb), 'sheet')) {
    const rid = aba.getAttribute('r:id') || aba.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let alvo = alvos[rid] || '';
    alvo = alvo.charAt(0) === '/' ? alvo.slice(1) : 'xl/' + alvo;
    const conteudo = await z.texto(alvo);
    if (!conteudo) continue;
    const linhas = [];
    filhos(xml(conteudo), 'row').forEach(function (row) {
      const linha = [];
      filhos(row, 'c').forEach(function (c, i) {
        const ref = c.getAttribute('r');
        const col = ref ? indiceColuna(ref) : i;
        const t = c.getAttribute('t');
        const vNo = filhos(c, 'v')[0];
        let v = vNo ? vNo.textContent : null;
        if (t === 's') v = compartilhadas[Number(v)];
        else if (t === 'inlineStr') v = filhos(c, 't').map(function (x) { return x.textContent; }).join('');
        else if (t === 'b') v = v === '1';
        else if (t !== 'str' && t !== 'e' && v !== null && v !== '' && isFinite(Number(v))) v = Number(v);
        linha[col] = v;
      });
      const r = Number(row.getAttribute('r')) - 1;
      linhas[isFinite(r) && r >= 0 ? r : linhas.length] = linha;
    });
    resultado[aba.getAttribute('name')] = Array.from(linhas, function (l) { return l || []; });
  }
  return resultado;
}
