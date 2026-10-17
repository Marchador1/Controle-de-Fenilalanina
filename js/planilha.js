// Conversão entre os dados do app e planilhas: backup completo, modelo de importação e leitura.
import { gerarXlsx, lerXlsx } from './xlsx.js';
import { FONTES, novoId, agoraIso, normalizarAlimento, semAcento } from './model.js';

// Colunas de cada aba: [cabeçalho, campo, tipo]. O cabeçalho é o que aparece no Excel.
const COLUNAS = {
  Alimentos: [
    ['Nome', 'nome'], ['Marca', 'marca'], ['Categoria', 'categoria'],
    ['Fenilalanina (mg/100 g)', 'pheMg100', 'n'], ['Proteína (g/100 g)', 'proteinaG100', 'n'],
    ['Porção', 'porcaoNome'], ['Gramas da porção', 'porcaoG', 'n'],
    ['Fonte', 'fonte', 'fonte'], ['Favorito', 'favorito', 'b'],
    ['ID', 'id'], ['Alterado em', 'updatedAt'], ['Excluído', 'deleted', 'b']
  ],
  Registros: [
    ['Data', 'data', 'data'], ['Hora', 'hora'], ['Perfil', 'perfilNome'], ['Refeição', 'refeicao'],
    ['Alimento', 'alimentoNome'], ['Quantidade (g)', 'quantidadeG', 'n'], ['Fenilalanina (mg)', 'pheMg', 'n'],
    ['Fenilalanina (mg/100 g)', 'pheMg100', 'n'], ['Medida', 'unidade'], ['Quantidade informada', 'qtdInformada', 'n'],
    ['Porção', 'porcaoNome'], ['Gramas da porção', 'porcaoG', 'n'],
    ['ID', 'id'], ['Perfil ID', 'perfilId'], ['Alimento ID', 'alimentoId'], ['Alterado em', 'updatedAt'], ['Excluído', 'deleted', 'b']
  ],
  Perfis: [
    ['Nome', 'nome'], ['Limite diário (mg)', 'limiteMg', 'n'],
    ['ID', 'id'], ['Alterado em', 'updatedAt'], ['Excluído', 'deleted', 'b']
  ]
};
const LOJA_DA_ABA = { Alimentos: 'alimentos', Registros: 'registros', Perfis: 'perfis' };

function paraCelula(v, tipo) {
  if (v === null || v === undefined) return '';
  if (tipo === 'b') return v ? 'sim' : '';
  if (tipo === 'fonte') return FONTES[v] || v;
  return v;
}

function chave(s) {
  return semAcento(String(s === null || s === undefined ? '' : s).toLowerCase()).replace(/[^a-z0-9]/g, '');
}

function deCelula(v, tipo) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') v = v.trim();
  if (v === '') return null;
  if (tipo === 'n') {
    const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
    if (typeof v === 'string' && /^\d+\.\d+$/.test(v)) return Number(v); // "12.5" escrito com ponto
    return isFinite(n) ? n : null;
  }
  if (tipo === 'b') return v === true || /^(s|sim|x|1|true|verdadeiro)$/i.test(String(v));
  if (tipo === 'fonte') {
    const k = chave(v);
    const achada = Object.keys(FONTES).find(function (f) { return k.indexOf(f) === 0 || chave(FONTES[f]) === k; });
    return achada || null;
  }
  if (tipo === 'data' && typeof v === 'number') {
    // Data guardada pelo Excel como número de série (dias desde 30/12/1899).
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  if (tipo === 'data' && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const p = v.split('/');
    return p[2] + '-' + p[1] + '-' + p[0];
  }
  return String(v);
}

// ---------- Exportar ----------
export function planilhaBackup(dados) {
  const perfilNome = {};
  dados.perfis.forEach(function (p) { perfilNome[p.id] = p.nome; });
  const abas = Object.keys(COLUNAS).map(function (aba) {
    const cols = COLUNAS[aba];
    let itens = dados[LOJA_DA_ABA[aba]];
    if (aba === 'Registros') {
      itens = itens.map(function (r) { return Object.assign({ perfilNome: perfilNome[r.perfilId] || '' }, r); })
        .sort(function (a, b) { return (a.data + a.hora).localeCompare(b.data + b.hora); });
    }
    if (aba === 'Alimentos') itens = itens.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    return {
      nome: aba,
      larguras: cols.map(function (c) { return c[1] === 'nome' || c[1] === 'alimentoNome' ? 40 : c[1] === 'categoria' ? 30 : 16; }),
      linhas: [cols.map(function (c) { return c[0]; })].concat(itens.map(function (i) {
        return cols.map(function (c) { return paraCelula(i[c[1]], c[2]); });
      }))
    };
  });
  abas.push(abaInstrucoes(true));
  return gerarXlsx(abas);
}

function abaInstrucoes(backup) {
  const linhas = [
    ['Como usar esta planilha'],
    [''],
    backup
      ? ['Este é o backup completo do app. Para levar os dados a outro aparelho, abra o app nele e use "Importar planilha".']
      : ['Preencha a aba Alimentos, uma linha por alimento, e importe no app em "Perfil e dados" > "Importar planilha".'],
    ['A importação junta a planilha com o que já está no aparelho: nada é apagado e vale a versão mais recente de cada item.'],
    [''],
    ['Aba Alimentos'],
    ['Nome', 'Obrigatório.'],
    ['Marca', 'Opcional. Se já existir um alimento com o mesmo nome e marca, ele é atualizado em vez de duplicado.'],
    ['Categoria', 'Opcional. Ex.: Frutas, Panificados.'],
    ['Fenilalanina (mg/100 g)', 'Teor de fenilalanina em 100 g. Se não souber, deixe vazio e preencha a proteína.'],
    ['Proteína (g/100 g)', 'Usada para estimar o teor quando ele não é informado (proteína × 50 mg).'],
    ['Porção', 'Opcional. Medida caseira, ex.: 1 fatia, 1 colher de sopa.'],
    ['Gramas da porção', 'Opcional. Quantos gramas tem a porção, ex.: 25.'],
    ['Fonte, Favorito', 'Opcionais. Fonte: Tabela, Rótulo ou Estimativa. Favorito: sim ou vazio.'],
    ['ID, Alterado em, Excluído', 'Controle do app. Deixe vazio em alimentos novos e não altere nos que já vieram preenchidos.'],
    [''],
    ['Números podem usar vírgula ou ponto decimal (12,5 ou 12.5).']
  ];
  if (backup) {
    linhas.push([''], ['Abas Registros e Perfis'], ['São o histórico de consumo e os perfis. Servem para restaurar o backup; não é preciso editá-las.']);
  }
  return { nome: 'Instruções', linhas: linhas, larguras: [28, 110], cabecalho: false };
}

export function planilhaModelo() {
  const cols = COLUNAS.Alimentos.slice(0, 7);
  return gerarXlsx([
    {
      nome: 'Alimentos',
      larguras: [40, 20, 24, 24, 20, 22, 18],
      linhas: [
        cols.map(function (c) { return c[0]; }),
        ['Pão de forma sem glúten (exemplo)', 'Marca X', 'Panificados', 120, '', '1 fatia', 25],
        ['Biscoito de polvilho (exemplo)', '', 'Biscoitos', '', 1.2, '1 unidade', 3]
      ]
    },
    abaInstrucoes(false)
  ]);
}

// ---------- Importar ----------
function linhasParaObjetos(linhas, cols) {
  if (!linhas.length) return [];
  const cab = (linhas[0] || []).map(chave);
  const mapa = cols.map(function (c) { return cab.indexOf(chave(c[0])); });
  // _linha guarda o número da linha no Excel, para as mensagens de erro.
  return linhas.map(function (l, i) { return { l: l, n: i + 1 }; }).slice(1).filter(function (x) {
    return x.l && x.l.some(function (v) { return v !== null && v !== undefined && String(v).trim() !== ''; });
  }).map(function (x) {
    const l = x.l;
    const o = { _linha: x.n };
    cols.forEach(function (c, i) { if (mapa[i] >= 0) o[c[1]] = deCelula(l[mapa[i]], c[2]); });
    return o;
  });
}

function acharAba(abas, nome) {
  const k = chave(nome);
  return Object.keys(abas).find(function (n) { return chave(n) === k; });
}

// Lê a planilha e devolve, por loja, os itens no formato do app (com id e updatedAt),
// prontos para a mesclagem. "existentes" são os alimentos do aparelho, para casar por nome e marca.
export async function lerPlanilha(buffer, existentes) {
  const abas = await lerXlsx(buffer);
  const nomes = Object.keys(abas);
  const abaAlimentos = acharAba(abas, 'Alimentos') || (nomes.length && !acharAba(abas, 'Registros') ? nomes[0] : null);
  const resultado = { alimentos: [], registros: [], perfis: [], erros: [] };
  const agora = agoraIso();

  if (abaAlimentos) {
    const porNomeMarca = {};
    existentes.forEach(function (a) { if (!a.deleted) porNomeMarca[chave(a.nome) + '|' + chave(a.marca)] = a; });
    linhasParaObjetos(abas[abaAlimentos], COLUNAS.Alimentos).forEach(function (o) {
      try {
        if (o.id && o.updatedAt) {
          // Linha de backup: mantém id e data de alteração para a mesclagem decidir.
          const a = normalizarAlimento(o, { id: o.id, favorito: o.favorito });
          a.fonte = o.fonte || a.fonte;
          if (o.pheMg100 !== null && o.pheMg100 !== undefined && !o.fonte) a.fonte = 'rotulo';
          a.updatedAt = o.updatedAt;
          a.deleted = !!o.deleted;
          resultado.alimentos.push(a);
          return;
        }
        const igual = o.id ? null : porNomeMarca[chave(o.nome) + '|' + chave(o.marca)];
        const base = igual || (o.id ? { id: o.id } : null);
        const a = normalizarAlimento(Object.assign({}, o, {
          fonte: o.fonte || (o.pheMg100 !== null && o.pheMg100 !== undefined ? 'rotulo' : 'estimativa'),
          porcaoNome: o.porcaoNome !== null && o.porcaoNome !== undefined ? o.porcaoNome : (igual && igual.porcaoNome),
          porcaoG: o.porcaoG !== null && o.porcaoG !== undefined ? o.porcaoG : (igual && igual.porcaoG)
        }), base);
        a.updatedAt = agora;
        resultado.alimentos.push(a);
      } catch (e) {
        resultado.erros.push('Alimentos, linha ' + o._linha + ': ' + e.message);
      }
    });
  }

  const abaPerfis = acharAba(abas, 'Perfis');
  if (abaPerfis) {
    linhasParaObjetos(abas[abaPerfis], COLUNAS.Perfis).forEach(function (o) {
      if (!o.nome) { resultado.erros.push('Perfis, linha ' + o._linha + ': sem nome.'); return; }
      resultado.perfis.push({
        id: o.id || novoId(), nome: o.nome, limiteMg: o.limiteMg > 0 ? o.limiteMg : null,
        updatedAt: o.updatedAt || agora, deleted: !!o.deleted
      });
    });
  }

  const abaRegistros = acharAba(abas, 'Registros');
  if (abaRegistros) {
    linhasParaObjetos(abas[abaRegistros], COLUNAS.Registros).forEach(function (o) {
      if (!o.id || !o.perfilId || !o.data || o.pheMg === null || o.pheMg === undefined) {
        resultado.erros.push('Registros, linha ' + o._linha + ': faltam ID, Perfil ID, Data ou Fenilalanina (mg).');
        return;
      }
      const r = Object.assign({}, o, {
        hora: o.hora || '00:00', unidade: o.unidade === 'porcao' ? 'porcao' : 'g',
        updatedAt: o.updatedAt || agora, deleted: !!o.deleted
      });
      delete r.perfilNome;
      delete r._linha;
      resultado.registros.push(r);
    });
  }

  if (!abaAlimentos && !abaPerfis && !abaRegistros) {
    throw new Error('Não encontrei a aba Alimentos. Use o modelo de planilha do app.');
  }
  return resultado;
}
