// Regras de negócio puras (sem acesso ao banco nem à tela), testáveis em Node.

// Fator usado quando o teor de fenilalanina não é conhecido: ~50 mg de Phe por grama de proteína.
export const PHE_POR_G_PROTEINA = 50;

export const FONTES = {
  tabela: 'Tabela oficial (ANVISA)',
  rotulo: 'Rótulo',
  estimativa: 'Estimativa (proteína × 50)'
};

export const REFEICOES = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Jantar', 'Ceia', 'Fórmula'];

export function novoId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function agoraIso() {
  return new Date().toISOString();
}

function doisDigitos(n) {
  return (n < 10 ? '0' : '') + n;
}

// Data local no formato AAAA-MM-DD (não usa UTC, para o dia virar à meia-noite do aparelho).
export function dataLocal(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());
}

export function horaLocal(d) {
  d = d || new Date();
  return doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes());
}

export function somarDias(dataStr, dias) {
  const p = dataStr.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  d.setDate(d.getDate() + dias);
  return dataLocal(d);
}

export function arredondar(n, casas) {
  const f = Math.pow(10, casas === undefined ? 1 : casas);
  return Math.round(n * f) / f;
}

function numeroOuNulo(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : null;
}

// Normaliza um alimento vindo do formulário ou de importação.
// Se faltar o teor de Phe mas houver proteína, estima e marca a fonte como "estimativa".
export function normalizarAlimento(entrada, existente) {
  const base = existente || {};
  const a = {
    id: base.id || entrada.id || novoId(),
    categoria: String(entrada.categoria || '').trim(),
    nome: String(entrada.nome || '').trim(),
    marca: String(entrada.marca || '').trim(),
    pheMg100: numeroOuNulo(entrada.pheMg100),
    proteinaG100: numeroOuNulo(entrada.proteinaG100),
    fonte: FONTES[entrada.fonte] ? entrada.fonte : 'rotulo',
    porcaoNome: String(entrada.porcaoNome || '').trim(),
    porcaoG: numeroOuNulo(entrada.porcaoG),
    favorito: !!(entrada.favorito !== undefined ? entrada.favorito : base.favorito),
    updatedAt: agoraIso(),
    deleted: false
  };
  if (!a.nome) throw new Error('Informe o nome do alimento.');
  if (a.pheMg100 === null) {
    if (a.proteinaG100 === null) throw new Error('Informe o teor de fenilalanina ou a proteína.');
    a.pheMg100 = arredondar(a.proteinaG100 * PHE_POR_G_PROTEINA, 0);
    a.fonte = 'estimativa';
  }
  return a;
}

// mg de Phe consumidos = gramas × teor (mg/100 g) ÷ 100.
export function calcularPhe(gramas, pheMg100) {
  return arredondar((Number(gramas) || 0) * (Number(pheMg100) || 0) / 100, 1);
}

// Situação do dia em relação ao limite: verde até 80%, amarelo até 100%, vermelho acima.
export function situacaoDoDia(totalMg, limiteMg) {
  if (!limiteMg) return { pct: 0, restante: null, nivel: 'sem-limite' };
  const pct = totalMg / limiteMg * 100;
  let nivel = 'ok';
  if (pct > 100) nivel = 'acima';
  else if (pct >= 80) nivel = 'atencao';
  return { pct: pct, restante: arredondar(limiteMg - totalMg, 1), nivel: nivel };
}

export function totalPhe(registros) {
  return arredondar(registros.reduce(function (s, r) { return s + (r.pheMg || 0); }, 0), 1);
}

// Mescla duas listas de itens com id e updatedAt: para cada id, vale a versão mais recente.
// Exclusões são mantidas como "lápide" (deleted: true) para também serem propagadas.
export function mesclar(locais, importados) {
  const porId = {};
  locais.forEach(function (i) { porId[i.id] = i; });
  const resultado = { novos: 0, atualizados: 0, ignorados: 0, itens: [] };
  importados.forEach(function (i) {
    if (!i || !i.id) { resultado.ignorados++; return; }
    const atual = porId[i.id];
    if (!atual) {
      resultado.novos++;
      resultado.itens.push(i);
    } else if ((i.updatedAt || '') > (atual.updatedAt || '')) {
      resultado.atualizados++;
      resultado.itens.push(i);
    } else {
      resultado.ignorados++;
    }
  });
  return resultado;
}

export function buscarTexto(alimento) {
  return semAcento([alimento.nome, alimento.marca, alimento.categoria].join(' ').toLowerCase());
}

export function semAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
