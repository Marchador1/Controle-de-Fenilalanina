// Baixa a tabela "Conteúdo de fenilalanina em alimentos" do painel público da ANVISA (Power BI)
// e grava data/anvisa.json, usado como base pré-cadastrada do app.
// Uso: node tools/importar-anvisa.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const CHAVE = '83ed4bee-9376-4e0f-81ae-5e33fd599552';
const API = 'https://wabi-brazil-south-api.analysis.windows.net/public/reports';
const CABECALHOS = { 'X-PowerBI-ResourceKey': CHAVE, 'Content-Type': 'application/json;charset=UTF-8' };
const COLUNAS = ['Categoria', 'DS_NOME', 'DS_MARCA_INDUSTRIALIZADO', 'NU_MAX_AMINOACIDO'];

async function json(resp) {
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' em ' + resp.url);
  return resp.json();
}

const modelo = await json(await fetch(API + '/' + CHAVE + '/modelsAndExploration?preferReadOnlySession=true', { headers: CABECALHOS }));
const m = modelo.models[0];

const corpo = {
  version: '1.0.0',
  queries: [{
    Query: { Commands: [{ SemanticQueryDataShapeCommand: {
      Query: {
        Version: 2,
        From: [{ Name: 'c', Entity: 'Consulta', Type: 0 }],
        Select: COLUNAS.map(function (p) {
          return { Column: { Expression: { SourceRef: { Source: 'c' } }, Property: p }, Name: 'Consulta.' + p };
        })
      },
      Binding: {
        Primary: { Groupings: [{ Projections: [0, 1, 2, 3] }] },
        DataReduction: { DataVolume: 4, Primary: { Window: { Count: 30000 } } },
        Version: 1
      }
    } }] },
    QueryId: '',
    ApplicationContext: { DatasetId: m.dbName, Sources: [{ ReportId: modelo.exploration.report && modelo.exploration.report.objectId }] }
  }],
  cancelQueries: [],
  modelId: m.id
};

const resp = await json(await fetch(API + '/querydata?synchronous=true', { method: 'POST', headers: CABECALHOS, body: JSON.stringify(corpo) }));
const dsr = resp.results[0].result.data.dsr;
if (!dsr.DS) throw new Error('Resposta sem dados: ' + JSON.stringify(dsr).slice(0, 500));
const ds = dsr.DS[0];
const dicionarios = ds.ValueDicts || {};
const linhas = ds.PH[0].DM0;
if (ds.RT) console.warn('Atenção: o painel não devolveu todas as linhas (há continuação).');

// Formato compactado do Power BI: S descreve as colunas, R marca colunas repetidas da linha anterior,
// Ø marca colunas nulas, e textos podem vir como índice de um dicionário (DN).
let esquema = null;
let anterior = [];
const registros = linhas.map(function (l) {
  if (l.S) esquema = l.S;
  const valores = [];
  let k = 0;
  for (let i = 0; i < esquema.length; i++) {
    if (l.R && (l.R >> i) & 1) { valores.push(anterior[i]); continue; }
    if (l['Ø'] && (l['Ø'] >> i) & 1) { valores.push(null); continue; }
    let v = l.C[k++];
    if (esquema[i].DN && typeof v === 'number') v = dicionarios[esquema[i].DN][v];
    valores.push(v);
  }
  anterior = valores;
  return valores;
});

function limpar(s) {
  return s === null || s === undefined ? '' : String(s).replace(/\s+/g, ' ').trim();
}

function chave(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Variações de grafia das categorias na fonte, unificadas na forma mais usada.
const APELIDOS = {
  'Especiarias, temperos e molhos': 'ESPECIARIAS, TEMPEROS, MOLHOS E PRODUTOS PARA O PREPARO DE MOLHOS',
  'TEMPERO COM CEBOLA E SALSA PARA PIPOCA': 'ESPECIARIAS, TEMPEROS, MOLHOS E PRODUTOS PARA O PREPARO DE MOLHOS',
  'Mistura para o preparo de alimentos e alimentos prontos para o consumo': 'MISTURAS PARA O PREPARO DE ALIMENTOS E ALIMENTOS PRONTOS PARA O CONSUMO',
  'Produtos de vegetais (exceto palmito), produtos de frutas e cogumelos comestíveis': 'FRUTAS E PRODUTOS DE FRUTAS (IN NATURA, CONGELADAS, DESIDRATADAS, COMPOTAS, DOCES E GELEIAS)',
  'FRUTAS E PRODUTOS DE FRUTAS (IN NATURA, CONGELADAS, DESIDRATADAS, COMPOTAS, DOCES E GELEIAS': 'FRUTAS E PRODUTOS DE FRUTAS (IN NATURA, CONGELADAS, DESIDRATADAS, COMPOTAS, DOCES E GELEIAS)',
  'HORTALIÇAS, LEGUMES, LEGUMINOSAS RAÍZES, TUBÉRCULOS E COGUMELOS COMESTÍVEIS (IN NATURA, CONGELADOS, EM CONSERVA, DESIDRATADOS, MINIMAMENTE PROCESSADOS)': 'HORTALIÇAS, LEGUMES, LEGUMINOSAS, RAÍZES, TUBÉRCULOS E COGUMELOS COMESTÍVEIS (IN NATURA, CONGELADOS, EM CONSERVA, DESIDRATADOS, MINIMAMENTE PROCESSADOS)'
};

let brutos = registros
  .map(function (v) {
    return { categoria: limpar(v[0]).replace(/;$/, ''), nome: limpar(v[1]), marca: limpar(v[2]), pheMg100: v[3] === null ? null : Number(v[3]) };
  })
  .filter(function (a) { return a.nome && a.pheMg100 !== null && isFinite(a.pheMg100); });

// Na fonte há linhas com categoria e nome trocados: o "nome" é uma categoria conhecida.
const categoriasConhecidas = {};
brutos.forEach(function (a) { categoriasConhecidas[chave(a.categoria)] = (categoriasConhecidas[chave(a.categoria)] || 0) + 1; });
brutos.forEach(function (a) {
  if ((categoriasConhecidas[chave(a.nome)] || 0) > 5 && (categoriasConhecidas[chave(a.categoria)] || 0) <= 1) {
    const c = a.categoria; a.categoria = a.nome; a.nome = c;
  }
  a.categoria = APELIDOS[a.categoria] || a.categoria;
  if (/^N[ÃA]O SE APLICA/i.test(a.marca)) a.marca = '';
});

// Id estável (mesmo em todos os aparelhos), para a sincronização não duplicar a base.
function hash(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822507);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
const vistos = {};
const alimentos = [];
brutos.forEach(function (a) {
  const id = 'anvisa-' + hash(chave(a.categoria) + '|' + chave(a.nome) + '|' + chave(a.marca) + '|' + a.pheMg100);
  if (vistos[id]) return;
  vistos[id] = true;
  alimentos.push(Object.assign({ id: id }, a));
});

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/anvisa.json', import.meta.url), JSON.stringify({
  fonte: 'ANVISA - Conteúdo de fenilalanina em alimentos (painel público)',
  baixadoEm: new Date().toISOString(),
  alimentos: alimentos
}));
console.log(registros.length + ' linhas recebidas, ' + alimentos.length + ' alimentos gravados em data/anvisa.json');
