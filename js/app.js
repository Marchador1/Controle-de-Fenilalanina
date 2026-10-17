import * as db from './db.js';
import {
  REFEICOES, novoId, agoraIso, dataLocal, horaLocal, somarDias, arredondar,
  normalizarAlimento, calcularPhe, situacaoDoDia, totalPhe, mesclar, buscarTexto, semAcento,
  PERIODOS, periodo, resumoPeriodo, formatarCurta
} from './model.js';
import { planilhaBackup, planilhaModelo, lerPlanilha } from './planilha.js';
import { carregarBaseAnvisa, NOMES_EXEMPLO } from './seed.js';

const estado = {
  perfil: null,
  data: dataLocal(),
  alimentos: [],
  textoBusca: {}
};

// Listas longas ficam lentas em celulares antigos: mostra só as primeiras e pede para refinar a busca.
const MAX_LISTA = 100;

// Busca por todas as palavras digitadas; nomes que começam com o termo aparecem primeiro.
function encontrar(termo) {
  if (!termo) return estado.alimentos;
  const palavras = termo.split(/\s+/);
  return estado.alimentos.filter(function (a) {
    const t = estado.textoBusca[a.id];
    return palavras.every(function (p) { return t.indexOf(p) >= 0; });
  }).map(function (a, i) {
    const nome = semAcento(a.nome.toLowerCase());
    return { a: a, peso: nome.indexOf(termo) === 0 ? 0 : nome.indexOf(termo) > 0 ? 1 : 2, i: i };
  }).sort(function (x, y) { return x.peso - y.peso || x.i - y.i; }).map(function (x) { return x.a; });
}

function categoriaCurta(c) {
  return (c || '').split(' (')[0];
}

function avisoLimite(total) {
  return total > MAX_LISTA
    ? '<li class="vazio">Mostrando ' + MAX_LISTA + ' de ' + total.toLocaleString('pt-BR') + '. Digite na busca para refinar.</li>'
    : '';
}

const $ = function (sel) { return document.querySelector(sel); };

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
  return arredondar(n, 1).toLocaleString('pt-BR');
}

function toast(msg) {
  const t = $('#aviso-toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { t.hidden = true; }, 3500);
}

// ---------- Modal ----------
function abrirModal(titulo, html) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML = html;
  $('#modal').hidden = false;
  const primeiro = $('#modal-corpo').querySelector('input:not([type=hidden]), select');
  if (primeiro && window.matchMedia('(min-width: 700px)').matches) primeiro.focus();
}
function fecharModal() {
  $('#modal').hidden = true;
  $('#modal-corpo').innerHTML = '';
}
$('#modal').addEventListener('click', function (e) {
  if (e.target.id === 'modal' || e.target.hasAttribute('data-fechar')) fecharModal();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !$('#modal').hidden) fecharModal();
});

// ---------- Navegação entre telas ----------
document.querySelectorAll('.abas button').forEach(function (b) {
  b.addEventListener('click', function () { mostrarTela(b.getAttribute('data-tela')); });
});
function mostrarTela(id) {
  document.querySelectorAll('.tela').forEach(function (t) { t.classList.toggle('ativa', t.id === id); });
  document.querySelectorAll('.abas button').forEach(function (b) {
    b.classList.toggle('ativa', b.getAttribute('data-tela') === id);
  });
  if (id === 'tela-hoje') renderHoje();
  if (id === 'tela-relatorios') renderRelatorio();
  if (id === 'tela-alimentos') renderAlimentos();
  if (id === 'tela-dados') renderDados();
  window.scrollTo(0, 0);
}

// ---------- Inicialização ----------
async function iniciar() {
  await atualizarBaseAnvisa();
  await definirPerfilAtivo(await db.lerConfig('perfilAtivo'));
  await carregarAlimentos();
  renderHoje();
}

// Usa o perfil pedido se ele existir; senão o primeiro, criando um se não houver nenhum.
async function definirPerfilAtivo(id) {
  let perfis = await db.todos('perfis');
  if (!perfis.length) {
    const p = { id: novoId(), nome: 'Meu perfil', limiteMg: null, updatedAt: agoraIso(), deleted: false };
    await db.salvar('perfis', p);
    perfis = [p];
  }
  estado.perfil = perfis.find(function (p) { return p.id === id; }) || perfis[0];
  await db.gravarConfig('perfilAtivo', estado.perfil.id);
  atualizarChipPerfil();
}

// Carrega a base da ANVISA na primeira abertura ou quando o app traz uma versão nova.
// Só entram itens que o aparelho ainda não tem, para não desfazer edições e exclusões do usuário.
async function atualizarBaseAnvisa() {
  let base;
  try {
    base = await carregarBaseAnvisa();
  } catch (e) {
    console.warn(e);
    return;
  }
  if ((await db.lerConfig('versaoBaseAnvisa')) === base.versao) return;
  const existentes = {};
  (await db.todosComExcluidos('alimentos')).forEach(function (a) { existentes[a.id] = a; });
  const novos = base.alimentos.filter(function (a) { return !existentes[a.id]; });
  // Remove os exemplos estimados da primeira versão do app.
  const exemplos = Object.keys(existentes).map(function (id) { return existentes[id]; }).filter(function (a) {
    return !a.deleted && a.fonte === 'estimativa' && NOMES_EXEMPLO.indexOf(a.nome) >= 0;
  }).map(function (a) { return Object.assign({}, a, { deleted: true, updatedAt: agoraIso() }); });
  await db.salvarVarios('alimentos', novos.concat(exemplos));
  await db.gravarConfig('versaoBaseAnvisa', base.versao);
}

async function carregarAlimentos() {
  estado.alimentos = (await db.todos('alimentos')).sort(function (a, b) {
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
  estado.textoBusca = {};
  estado.alimentos.forEach(function (a) { estado.textoBusca[a.id] = buscarTexto(a); });
}

function atualizarChipPerfil() {
  $('#perfil-atual').textContent = estado.perfil.nome;
}
$('#perfil-atual').addEventListener('click', function () { mostrarTela('tela-dados'); });

// ---------- Tela Hoje ----------
function tituloDia(data) {
  const hoje = dataLocal();
  if (data === hoje) return 'Hoje';
  if (data === somarDias(hoje, -1)) return 'Ontem';
  const p = data.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

$('#dia-anterior').addEventListener('click', function () { estado.data = somarDias(estado.data, -1); renderHoje(); });
$('#dia-seguinte').addEventListener('click', function () { estado.data = somarDias(estado.data, 1); renderHoje(); });
$('#dia-titulo').addEventListener('click', function () {
  abrirModal('Escolher dia',
    '<label class="campo">Data<input type="date" id="f-data" value="' + estado.data + '"></label>' +
    '<div class="modal-rodape"><button type="button" class="btn esquerda" id="ir-hoje">Hoje</button>' +
    '<button type="button" class="btn" data-fechar>Cancelar</button>' +
    '<button type="button" class="btn primario" id="ir-data">Ir</button></div>');
  $('#ir-hoje').onclick = function () { estado.data = dataLocal(); fecharModal(); renderHoje(); };
  $('#ir-data').onclick = function () {
    const v = $('#f-data').value;
    if (v) { estado.data = v; fecharModal(); renderHoje(); }
  };
});

async function renderHoje() {
  const registros = await db.registrosDoDia(estado.perfil.id, estado.data);
  const ontem = await db.registrosDoDia(estado.perfil.id, somarDias(estado.data, -1));
  $('#dia-titulo').textContent = tituloDia(estado.data);

  // Limite
  const total = totalPhe(registros);
  const limite = estado.perfil.limiteMg;
  const s = situacaoDoDia(total, limite);
  const painel = $('#painel-limite');
  painel.className = 'painel-limite nivel-' + s.nivel;
  $('#total-dia').textContent = fmt(total);
  $('#restante-dia').textContent = s.restante === null ? '–' : fmt(s.restante);
  $('#barra-preenchida').style.width = Math.min(s.pct, 100) + '%';
  $('#barra').setAttribute('aria-valuenow', String(Math.round(s.pct)));
  $('#limite-texto').innerHTML = limite
    ? 'Limite diário: <strong>' + fmt(limite) + ' mg</strong> · ' + Math.round(s.pct) + '% consumido' +
      (s.nivel === 'acima' ? ' · <strong>acima do limite</strong>' : '')
    : 'Sem limite diário definido. <a href="#" id="definir-limite">Definir agora</a>';
  const link = $('#definir-limite');
  if (link) link.onclick = function (e) { e.preventDefault(); modalPerfil(estado.perfil); };

  // Grupos por refeição, na ordem padrão (refeições fora da lista vão ao fim)
  const grupos = {};
  registros.forEach(function (r) { (grupos[r.refeicao] = grupos[r.refeicao] || []).push(r); });
  const ordem = REFEICOES.concat(Object.keys(grupos).filter(function (k) { return REFEICOES.indexOf(k) < 0; }));

  $('#lista-refeicoes').innerHTML = ordem.map(function (ref) {
    const itens = (grupos[ref] || []).sort(function (a, b) { return a.hora.localeCompare(b.hora); });
    const temOntem = ontem.some(function (r) { return r.refeicao === ref; });
    const sub = itens.length ? ' · ' + fmt(totalPhe(itens)) + ' mg' : '';
    return '<div class="refeicao">' +
      '<div class="refeicao-cab"><h2>' + esc(ref) + '<span class="detalhe">' + sub + '</span></h2>' +
      '<div class="refeicao-acoes">' +
      (!itens.length && temOntem ? '<button type="button" class="btn pequeno" data-repetir="' + esc(ref) + '">Repetir de ontem</button>' : '') +
      '<button type="button" class="btn pequeno primario" data-adicionar="' + esc(ref) + '">+ Adicionar</button>' +
      '</div></div>' +
      (itens.length
        ? '<ul class="lista">' + itens.map(function (r) {
            return '<li class="clicavel" data-registro="' + r.id + '"><div class="info"><div class="nome">' + esc(r.alimentoNome) + '</div>' +
              '<div class="detalhe">' + esc(r.hora) + ' · ' + esc(descricaoQuantidade(r)) + '</div></div>' +
              '<div class="valor">' + fmt(r.pheMg) + ' mg</div></li>';
          }).join('') + '</ul>'
        : '') +
      '</div>';
  }).join('');

  $('#lista-refeicoes').querySelectorAll('[data-adicionar]').forEach(function (b) {
    b.onclick = function () { modalRegistro(null, b.getAttribute('data-adicionar')); };
  });
  $('#lista-refeicoes').querySelectorAll('[data-repetir]').forEach(function (b) {
    b.onclick = function () { repetirDeOntem(b.getAttribute('data-repetir'), ontem); };
  });
  $('#lista-refeicoes').querySelectorAll('[data-registro]').forEach(function (li) {
    li.onclick = function () {
      const r = registros.find(function (x) { return x.id === li.getAttribute('data-registro'); });
      modalRegistro(r);
    };
  });
}

function descricaoQuantidade(r) {
  if (r.unidade === 'porcao' && r.porcaoNome) {
    return fmt(r.qtdInformada) + ' × ' + r.porcaoNome + ' (' + fmt(r.quantidadeG) + ' g)';
  }
  return fmt(r.quantidadeG) + ' g';
}

async function repetirDeOntem(refeicao, ontem) {
  const novos = ontem.filter(function (r) { return r.refeicao === refeicao; }).map(function (r) {
    return Object.assign({}, r, { id: novoId(), data: estado.data, updatedAt: agoraIso() });
  });
  await db.salvarVarios('registros', novos);
  toast(novos.length + ' item(ns) copiado(s) de ontem.');
  renderHoje();
}

// ---------- Modal de registro de consumo ----------
async function modalRegistro(registro, refeicaoPadrao) {
  const editando = !!registro;
  let escolhido = null;
  if (editando) {
    const atual = estado.alimentos.find(function (a) { return a.id === registro.alimentoId; });
    // O teor gravado no registro prevalece: editar a base não muda o histórico.
    escolhido = Object.assign({}, atual || {}, {
      id: registro.alimentoId, nome: registro.alimentoNome, pheMg100: registro.pheMg100,
      porcaoNome: registro.porcaoNome || (atual && atual.porcaoNome) || '',
      porcaoG: registro.porcaoG || (atual && atual.porcaoG) || null
    });
  }
  const recentes = (await db.lerConfig('recentes')) || [];
  const refeicao = editando ? registro.refeicao : (refeicaoPadrao || REFEICOES[0]);

  abrirModal(editando ? 'Editar consumo' : 'Registrar consumo',
    '<div id="area-busca"' + (editando ? ' hidden' : '') + '>' +
      '<input type="search" id="f-busca" placeholder="Buscar alimento" aria-label="Buscar alimento" autocomplete="off">' +
      '<div class="resultados"><ul class="lista" id="f-resultados"></ul></div>' +
    '</div>' +
    '<div id="area-qtd" hidden>' +
      '<div class="escolhido" id="f-escolhido"></div>' +
      '<div class="linha">' +
        '<label class="campo"><span id="f-qtd-rotulo">Quantidade em gramas</span>' +
          '<span class="com-sufixo"><input type="number" id="f-qtd" inputmode="decimal" min="0" step="any" placeholder="ex.: 75">' +
          '<span class="sufixo" id="f-sufixo">g</span></span></label>' +
        '<label class="campo" id="f-unidade-campo" hidden>Medida<select id="f-unidade"></select></label>' +
      '</div>' +
      '<div class="atalhos" id="f-atalhos">' + [25, 50, 75, 100, 150, 200].map(function (g) {
        return '<button type="button" class="btn pequeno" data-gramas="' + g + '">' + g + ' g</button>';
      }).join('') + '</div>' +
      '<p class="previa" id="f-previa"></p>' +
      '<div class="linha">' +
        '<label class="campo">Refeição<select id="f-refeicao">' +
          REFEICOES.concat(REFEICOES.indexOf(refeicao) < 0 ? [refeicao] : []).map(function (r) {
            return '<option' + (r === refeicao ? ' selected' : '') + '>' + esc(r) + '</option>';
          }).join('') + '</select></label>' +
        '<label class="campo">Hora<input type="time" id="f-hora" value="' + (editando ? registro.hora : horaLocal()) + '"></label>' +
      '</div>' +
      '<label class="campo">Data<input type="date" id="f-data" value="' + (editando ? registro.data : estado.data) + '"></label>' +
    '</div>' +
    '<div class="modal-rodape">' +
      (editando ? '<button type="button" class="btn perigo esquerda" id="f-excluir">Excluir</button>' : '') +
      '<button type="button" class="btn" data-fechar>Cancelar</button>' +
      '<button type="button" class="btn primario" id="f-salvar" hidden>Salvar</button>' +
    '</div>');

  function itemLista(a) {
    return '<li class="clicavel" data-id="' + a.id + '"><div class="info"><div class="nome">' + esc(a.nome) +
      (a.favorito ? ' ★' : '') + '</div><div class="detalhe">' + esc([a.marca, categoriaCurta(a.categoria)].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="valor">' + fmt(a.pheMg100) + ' mg/100 g</div></li>';
  }

  function listar() {
    const termo = semAcento($('#f-busca').value.trim().toLowerCase());
    let html = '';
    if (!termo) {
      const fav = estado.alimentos.filter(function (a) { return a.favorito; });
      const rec = recentes.map(function (id) { return estado.alimentos.find(function (a) { return a.id === id; }); })
        .filter(function (a) { return a && !a.favorito; });
      if (fav.length) html += '<li class="secao-titulo">Favoritos</li>' + fav.map(itemLista).join('');
      if (rec.length) html += '<li class="secao-titulo">Recentes</li>' + rec.map(itemLista).join('');
      html += '<li class="secao-titulo">Todos</li>' + estado.alimentos.slice(0, MAX_LISTA).map(itemLista).join('') +
        avisoLimite(estado.alimentos.length);
    } else {
      const achados = encontrar(termo);
      html = achados.length ? achados.slice(0, MAX_LISTA).map(itemLista).join('') + avisoLimite(achados.length)
        : '<li class="vazio">Nenhum alimento encontrado. Cadastre-o na tela Alimentos.</li>';
    }
    $('#f-resultados').innerHTML = html;
    $('#f-resultados').querySelectorAll('[data-id]').forEach(function (li) {
      li.onclick = function () {
        escolher(estado.alimentos.find(function (a) { return a.id === li.getAttribute('data-id'); }));
      };
    });
  }

  function escolher(a) {
    escolhido = a;
    $('#area-busca').hidden = true;
    $('#area-qtd').hidden = false;
    $('#f-salvar').hidden = false;
    $('#f-escolhido').innerHTML = '<div class="nome">' + esc(a.nome) + '</div><div class="detalhe">' +
      fmt(a.pheMg100) + ' mg de Phe por 100 g' + (a.fonte === 'estimativa' ? ' · <span class="selo estimativa">estimado</span>' : '') +
      (editando ? '' : ' · <a href="#" id="f-trocar">trocar</a>') + '</div>';
    const trocar = $('#f-trocar');
    if (trocar) trocar.onclick = function (e) {
      e.preventDefault();
      $('#area-busca').hidden = false; $('#area-qtd').hidden = true; $('#f-salvar').hidden = true;
      $('#f-busca').focus();
    };
    // A escolha de medida só aparece quando o alimento tem porção cadastrada; senão é sempre em gramas.
    const temPorcao = a.porcaoG > 0;
    $('#f-unidade-campo').hidden = !temPorcao;
    $('#f-unidade').innerHTML = '<option value="g">gramas</option>' +
      (temPorcao ? '<option value="porcao">' + esc(a.porcaoNome || 'porção') + ' (' + fmt(a.porcaoG) + ' g)</option>' : '');
    if (editando) {
      $('#f-unidade').value = registro.unidade === 'porcao' && temPorcao ? 'porcao' : 'g';
      $('#f-qtd').value = $('#f-unidade').value === 'porcao' ? registro.qtdInformada : registro.quantidadeG;
    } else {
      $('#f-unidade').value = temPorcao ? 'porcao' : 'g';
      $('#f-qtd').value = temPorcao ? 1 : '';
    }
    atualizarUnidade();
    $('#f-qtd').focus();
  }

  function atualizarUnidade() {
    const porcao = $('#f-unidade').value === 'porcao';
    $('#f-qtd-rotulo').textContent = porcao ? 'Quantidade de porções' : 'Quantidade em gramas';
    $('#f-sufixo').textContent = porcao ? '×' : 'g';
    $('#f-qtd').placeholder = porcao ? 'ex.: 1' : 'ex.: 75';
    $('#f-atalhos').hidden = porcao;
    atualizarPrevia();
  }

  function gramas() {
    const q = Number(String($('#f-qtd').value).replace(',', '.')) || 0;
    return $('#f-unidade').value === 'porcao' ? q * escolhido.porcaoG : q;
  }
  function atualizarPrevia() {
    $('#f-previa').textContent = '= ' + fmt(calcularPhe(gramas(), escolhido.pheMg100)) + ' mg de fenilalanina';
  }

  $('#f-busca').addEventListener('input', listar);
  $('#f-qtd').addEventListener('input', atualizarPrevia);
  $('#f-unidade').addEventListener('change', function () { $('#f-qtd').value = ''; atualizarUnidade(); $('#f-qtd').focus(); });
  $('#f-atalhos').querySelectorAll('[data-gramas]').forEach(function (b) {
    b.onclick = function () { $('#f-qtd').value = b.getAttribute('data-gramas'); atualizarPrevia(); };
  });

  $('#f-salvar').onclick = async function () {
    const g = gramas();
    if (!(g > 0)) { toast('Informe a quantidade.'); return; }
    const porcao = $('#f-unidade').value === 'porcao';
    const r = {
      id: editando ? registro.id : novoId(),
      perfilId: editando ? registro.perfilId : estado.perfil.id,
      data: $('#f-data').value || estado.data,
      hora: $('#f-hora').value || horaLocal(),
      refeicao: $('#f-refeicao').value,
      alimentoId: escolhido.id,
      alimentoNome: escolhido.nome,
      pheMg100: escolhido.pheMg100,
      unidade: porcao ? 'porcao' : 'g',
      qtdInformada: Number(String($('#f-qtd').value).replace(',', '.')),
      porcaoNome: porcao ? escolhido.porcaoNome : '',
      porcaoG: porcao ? escolhido.porcaoG : null,
      quantidadeG: arredondar(g, 1),
      pheMg: calcularPhe(g, escolhido.pheMg100),
      updatedAt: agoraIso(),
      deleted: false
    };
    await db.salvar('registros', r);
    await db.gravarConfig('recentes', [r.alimentoId].concat(recentes.filter(function (id) { return id !== r.alimentoId; })).slice(0, 8));
    fecharModal();
    toast('Registrado: ' + fmt(r.pheMg) + ' mg.');
    renderHoje();
  };

  if (editando) {
    $('#f-excluir').onclick = async function () {
      if (!confirm('Excluir este registro?')) return;
      await db.excluir('registros', registro.id);
      fecharModal();
      renderHoje();
    };
    escolher(escolhido);
  } else {
    listar();
  }
}

// ---------- Tela Alimentos ----------
$('#busca-alimentos').addEventListener('input', renderAlimentos);
$('#novo-alimento').addEventListener('click', function () { modalAlimento(null); });

function renderAlimentos() {
  const termo = semAcento($('#busca-alimentos').value.trim().toLowerCase());
  const lista = encontrar(termo);
  $('#lista-alimentos').innerHTML = lista.length ? lista.slice(0, MAX_LISTA).map(function (a) {
    return '<li><button type="button" class="estrela" data-fav="' + a.id + '" aria-label="' + (a.favorito ? 'Remover dos favoritos' : 'Favoritar') + '">' +
      (a.favorito ? '★' : '☆') + '</button>' +
      '<div class="info clicavel" data-editar="' + a.id + '"><div class="nome">' + esc(a.nome) + '</div>' +
      '<div class="detalhe">' + esc([a.marca, categoriaCurta(a.categoria)].filter(Boolean).join(' · ')) +
      (a.porcaoG ? ' · ' + esc(a.porcaoNome || 'porção') + ' = ' + fmt(a.porcaoG) + ' g' : '') + ' ' +
      (a.fonte === 'tabela' ? '' : '<span class="selo' + (a.fonte === 'estimativa' ? ' estimativa' : '') + '">' + (a.fonte === 'estimativa' ? 'estimado' : 'rótulo') + '</span>') + '</div></div>' +
      '<div class="valor clicavel" data-editar="' + a.id + '">' + fmt(a.pheMg100) + '<span class="detalhe"> mg/100 g</span></div>' +
      '<button type="button" class="btn-editar" data-editar="' + a.id + '" aria-label="Editar ' + esc(a.nome) + '">✎<span>Editar</span></button></li>';
  }).join('') + avisoLimite(lista.length) : '<li class="vazio">Nenhum alimento encontrado.</li>';

  $('#lista-alimentos').querySelectorAll('[data-editar]').forEach(function (el) {
    el.onclick = function () { modalAlimento(estado.alimentos.find(function (a) { return a.id === el.getAttribute('data-editar'); })); };
  });
  $('#lista-alimentos').querySelectorAll('[data-fav]').forEach(function (el) {
    el.onclick = async function () {
      const a = estado.alimentos.find(function (x) { return x.id === el.getAttribute('data-fav'); });
      a.favorito = !a.favorito;
      a.updatedAt = agoraIso();
      await db.salvar('alimentos', a);
      renderAlimentos();
    };
  });
}

function modalAlimento(a) {
  const ed = a || {};
  abrirModal(a ? 'Editar alimento' : 'Novo alimento',
    '<label class="campo">Nome*<input id="a-nome" value="' + esc(ed.nome) + '" required></label>' +
    '<div class="linha">' +
      '<label class="campo">Categoria<input id="a-categoria" value="' + esc(ed.categoria) + '" list="a-categorias"></label>' +
      '<label class="campo">Marca<input id="a-marca" value="' + esc(ed.marca) + '"></label>' +
    '</div>' +
    '<datalist id="a-categorias">' + categorias().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
    '<div class="linha">' +
      '<label class="campo">Fenilalanina (mg/100 g)<input id="a-phe" type="number" inputmode="decimal" min="0" step="any" value="' + (ed.pheMg100 === undefined || ed.pheMg100 === null ? '' : ed.pheMg100) + '"></label>' +
      '<label class="campo">Proteína (g/100 g)<input id="a-prot" type="number" inputmode="decimal" min="0" step="any" value="' + (ed.proteinaG100 === undefined || ed.proteinaG100 === null ? '' : ed.proteinaG100) + '"></label>' +
    '</div>' +
    '<p class="ajuda">Sem o teor de fenilalanina, o app estima pela proteína (× 50 mg) e marca como estimado.</p>' +
    '<div class="linha">' +
      '<label class="campo">Porção padrão<input id="a-porcao" placeholder="ex.: 1 fatia" value="' + esc(ed.porcaoNome) + '"></label>' +
      '<label class="campo">Gramas da porção<input id="a-porcao-g" type="number" inputmode="decimal" min="0" step="any" value="' + (ed.porcaoG || '') + '"></label>' +
    '</div>' +
    '<div class="modal-rodape">' +
      (a ? '<button type="button" class="btn perigo esquerda" id="a-excluir">Excluir</button>' : '') +
      '<button type="button" class="btn" data-fechar>Cancelar</button>' +
      '<button type="button" class="btn primario" id="a-salvar">Salvar</button>' +
    '</div>');

  // A fonte do dado é definida sozinha: mantém a original se o teor não mudou, vira "rótulo" se o
  // usuário digitou o teor e "estimativa" se só informou a proteína.
  const pheOriginal = ed.pheMg100;
  $('#a-salvar').onclick = async function () {
    let phe = $('#a-phe').value;
    const pheMudou = String(phe) !== String(pheOriginal === undefined || pheOriginal === null ? '' : pheOriginal);
    if (ed.fonte === 'estimativa' && !pheMudou && $('#a-prot').value !== String(ed.proteinaG100)) phe = '';
    const fonte = a && !pheMudou ? ed.fonte : 'rotulo';
    try {
      const novo = normalizarAlimento({
        nome: $('#a-nome').value, categoria: $('#a-categoria').value, marca: $('#a-marca').value,
        pheMg100: phe, proteinaG100: $('#a-prot').value, fonte: fonte,
        porcaoNome: $('#a-porcao').value, porcaoG: $('#a-porcao-g').value
      }, a);
      await db.salvar('alimentos', novo);
      await carregarAlimentos();
      fecharModal();
      toast(novo.fonte === 'estimativa' ? 'Salvo com teor estimado: ' + fmt(novo.pheMg100) + ' mg/100 g.' : 'Alimento salvo.');
      renderAlimentos();
    } catch (e) {
      toast(e.message);
    }
  };
  if (a) {
    $('#a-excluir').onclick = async function () {
      if (!confirm('Excluir "' + a.nome + '" da base? Os registros já feitos continuam no histórico.')) return;
      await db.excluir('alimentos', a.id);
      await carregarAlimentos();
      fecharModal();
      renderAlimentos();
    };
  }
}

function categorias() {
  const c = {};
  estado.alimentos.forEach(function (a) { if (a.categoria) c[a.categoria] = true; });
  return Object.keys(c).sort();
}

// ---------- Tela Perfil e dados ----------
$('#novo-perfil').addEventListener('click', function () { modalPerfil(null); });

async function renderDados() {
  const perfis = await db.todos('perfis');
  $('#lista-perfis').innerHTML = perfis.map(function (p) {
    const ativo = p.id === estado.perfil.id;
    return '<li><div class="info clicavel" data-editar="' + p.id + '"><div class="nome">' + esc(p.nome) + (ativo ? ' <span class="selo">em uso</span>' : '') + '</div>' +
      '<div class="detalhe">Limite: ' + (p.limiteMg ? fmt(p.limiteMg) + ' mg/dia' : 'não definido') + '</div></div>' +
      (ativo ? '' : '<button type="button" class="btn pequeno" data-usar="' + p.id + '">Usar</button>') + '</li>';
  }).join('');
  $('#lista-perfis').querySelectorAll('[data-editar]').forEach(function (el) {
    el.onclick = function () { modalPerfil(perfis.find(function (p) { return p.id === el.getAttribute('data-editar'); })); };
  });
  $('#lista-perfis').querySelectorAll('[data-usar]').forEach(function (el) {
    el.onclick = async function () {
      estado.perfil = perfis.find(function (p) { return p.id === el.getAttribute('data-usar'); });
      await db.gravarConfig('perfilAtivo', estado.perfil.id);
      atualizarChipPerfil();
      toast('Perfil em uso: ' + estado.perfil.nome);
      renderDados();
    };
  });
  const ultimo = await db.lerConfig('ultimoBackup');
  $('#ultimo-backup').textContent = ultimo
    ? 'Último backup exportado em ' + new Date(ultimo).toLocaleString('pt-BR') + '.'
    : 'Nenhum backup exportado ainda.';
}

function modalPerfil(p) {
  const ed = p || {};
  abrirModal(p ? 'Editar perfil' : 'Novo perfil',
    '<label class="campo">Nome<input id="p-nome" value="' + esc(ed.nome) + '"></label>' +
    '<label class="campo">Limite diário de fenilalanina (mg/dia)<input id="p-limite" type="number" inputmode="decimal" min="0" step="any" value="' + (ed.limiteMg || '') + '"></label>' +
    '<p class="ajuda">Use o valor indicado pelo nutricionista ou médico.</p>' +
    '<div class="modal-rodape">' +
    (p ? '<button type="button" class="btn perigo esquerda" id="p-excluir">Excluir perfil</button>' : '') +
    '<button type="button" class="btn" data-fechar>Cancelar</button>' +
    '<button type="button" class="btn primario" id="p-salvar">Salvar</button></div>');
  if (p) {
    $('#p-excluir').onclick = async function () {
      const perfis = await db.todos('perfis');
      if (perfis.length <= 1) { toast('Este é o único perfil. Crie outro antes de excluir este.'); return; }
      if (!confirm('Excluir o perfil "' + p.nome + '" e todo o histórico de consumo dele? Exporte a planilha antes, se quiser guardar os dados.')) return;
      const registros = (await db.todos('registros')).filter(function (r) { return r.perfilId === p.id; });
      const agora = agoraIso();
      await db.salvarVarios('registros', registros.map(function (r) { return Object.assign({}, r, { deleted: true, updatedAt: agora }); }));
      await db.excluir('perfis', p.id);
      if (estado.perfil.id === p.id) await definirPerfilAtivo(null);
      fecharModal();
      toast('Perfil excluído.');
      renderDados();
    };
  }
  $('#p-salvar').onclick = async function () {
    const nome = $('#p-nome').value.trim();
    if (!nome) { toast('Informe o nome do perfil.'); return; }
    const limite = Number(String($('#p-limite').value).replace(',', '.'));
    const novo = {
      id: ed.id || novoId(), nome: nome, limiteMg: limite > 0 ? limite : null,
      updatedAt: agoraIso(), deleted: false
    };
    await db.salvar('perfis', novo);
    if (novo.id === estado.perfil.id) { estado.perfil = novo; atualizarChipPerfil(); }
    fecharModal();
    if ($('#tela-hoje').classList.contains('ativa')) renderHoje(); else renderDados();
  };
}

// ---------- Planilhas: backup, importação e modelo ----------
function baixar(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

$('#exportar').addEventListener('click', async function () {
  const dados = {};
  for (const nome of db.LOJAS) dados[nome] = await db.todosComExcluidos(nome);
  baixar(planilhaBackup(dados), 'fenilalanina-backup-' + dataLocal() + '.xlsx');
  await db.gravarConfig('ultimoBackup', agoraIso());
  renderDados();
});

$('#baixar-modelo').addEventListener('click', function () {
  baixar(planilhaModelo(), 'modelo-alimentos-fenilalanina.xlsx');
});

$('#importar-arquivo').addEventListener('change', async function (e) {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    let dados;
    let erros = [];
    if (/\.json$/i.test(arquivo.name)) {
      // Backups da primeira versão do app.
      dados = JSON.parse(await arquivo.text());
      if (dados.app !== 'controle-fenilalanina') throw new Error('Este arquivo não é um backup deste app.');
    } else {
      dados = await lerPlanilha(await arquivo.arrayBuffer(), await db.todosComExcluidos('alimentos'));
      erros = dados.erros;
    }
    const resumo = [];
    for (const nome of db.LOJAS) {
      const itens = Array.isArray(dados[nome]) ? dados[nome] : [];
      if (!itens.length) continue;
      const r = mesclar(await db.todosComExcluidos(nome), itens);
      await db.salvarVarios(nome, r.itens);
      resumo.push(nome + ': ' + r.novos + ' novos, ' + r.atualizados + ' atualizados');
    }
    await carregarAlimentos();
    await definirPerfilAtivo(estado.perfil.id);
    renderDados();
    abrirModal('Importação concluída',
      '<p>' + (resumo.length ? esc(resumo.join(' · ')) : 'Nada novo para importar.') + '</p>' +
      (erros.length ? '<p class="ajuda">' + erros.length + ' linha(s) ignorada(s):</p><ul class="ajuda">' +
        erros.slice(0, 20).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="modal-rodape"><button type="button" class="btn primario" data-fechar>OK</button></div>');
  } catch (err) {
    toast('Não foi possível importar: ' + err.message);
  }
});

// ---------- Relatórios ----------
const relatorio = { tipo: 'semana', passo: 0 };

$('#tipos-periodo').innerHTML = Object.keys(PERIODOS).map(function (k) {
  return '<button type="button" role="tab" data-periodo="' + k + '">' + PERIODOS[k] + '</button>';
}).join('');
$('#tipos-periodo').querySelectorAll('[data-periodo]').forEach(function (b) {
  b.onclick = function () { relatorio.tipo = b.getAttribute('data-periodo'); relatorio.passo = 0; renderRelatorio(); };
});
$('#periodo-anterior').addEventListener('click', function () { relatorio.passo--; renderRelatorio(); });
$('#periodo-seguinte').addEventListener('click', function () { relatorio.passo++; renderRelatorio(); });
$('#gerar-pdf').addEventListener('click', function () {
  toast('Na janela de impressão, escolha "Salvar como PDF".');
  setTimeout(function () { window.print(); }, 300);
});

const NIVEL_TEXTO = { ok: 'Dentro do limite', atencao: 'Perto do limite', acima: 'Acima do limite', 'sem-limite': 'Sem limite' };

async function renderRelatorio() {
  const per = periodo(relatorio.tipo, dataLocal(), relatorio.passo);
  const limite = estado.perfil.limiteMg;
  const registros = await db.registrosNoPeriodo(estado.perfil.id, per.inicio, per.fim);
  const r = resumoPeriodo(registros, per.inicio, per.fim, limite);

  $('#tipos-periodo').querySelectorAll('[data-periodo]').forEach(function (b) {
    const ativo = b.getAttribute('data-periodo') === relatorio.tipo;
    b.classList.toggle('ativa', ativo);
    b.setAttribute('aria-selected', ativo ? 'true' : 'false');
  });
  $('#periodo-titulo').textContent = per.titulo.charAt(0).toUpperCase() + per.titulo.slice(1);
  $('#periodo-seguinte').disabled = per.fim >= dataLocal();
  $('#cabecalho-impressao').innerHTML = '<h1>Relatório de consumo de fenilalanina</h1>' +
    '<p>Perfil: <strong>' + esc(estado.perfil.nome) + '</strong> · Período: ' + esc(per.titulo) +
    ' (' + formatarCurta(per.inicio) + ' a ' + formatarCurta(per.fim) + ')' +
    (limite ? ' · Limite diário: ' + fmt(limite) + ' mg' : '') + '<br>Gerado em ' + new Date().toLocaleString('pt-BR') + '</p>';

  if (!r.diasComRegistro) {
    $('#relatorio').innerHTML = '<div class="cartao"><p class="vazio">Nenhum consumo registrado neste período.</p></div>';
    return;
  }

  function indicador(rotulo, valor, sub, classe) {
    return '<div class="indicador' + (classe ? ' ' + classe : '') + '"><span class="rotulo">' + rotulo + '</span><strong>' + valor + '</strong>' +
      (sub ? '<span class="detalhe">' + sub + '</span>' : '') + '</div>';
  }
  const nivelMedia = limite ? situacaoDoDia(r.mediaDiaria, limite).nivel : 'sem-limite';
  const indicadores = '<div class="indicadores">' +
    indicador('Média diária', fmt(r.mediaDiaria) + ' mg',
      limite ? r.mediaSobreLimite + '% do limite · ' + NIVEL_TEXTO[nivelMedia] : 'defina um limite no perfil', 'nivel-' + nivelMedia) +
    indicador('Dias registrados', r.diasComRegistro + ' de ' + r.diasNoPeriodo, 'a média considera só esses dias') +
    (limite ? indicador('Dias acima do limite', String(r.diasAcima), r.diasDentro + ' dia(s) dentro do limite', r.diasAcima ? 'nivel-acima' : '') : '') +
    indicador('Maior consumo', fmt(r.maior.total) + ' mg', formatarCurta(r.maior.data)) +
    indicador('Menor consumo', fmt(r.menor.total) + ' mg', formatarCurta(r.menor.data)) +
    indicador('Total no período', fmt(r.total) + ' mg', '') +
    '</div>';

  const tabelaDias = r.dias.filter(function (d) { return d.total !== null; }).map(function (d) {
    return '<tr><td>' + formatarCurta(d.data) + '</td><td class="num">' + fmt(d.total) + '</td>' +
      '<td>' + (limite ? '<span class="ponto nivel-' + d.nivel + '"></span>' + NIVEL_TEXTO[d.nivel] : '–') + '</td></tr>';
  }).join('');
  const tabelaAlimentos = r.alimentos.slice(0, 10).map(function (a) {
    return '<tr><td>' + esc(a.nome) + '</td><td class="num">' + a.vezes + '</td><td class="num">' + fmt(a.mg) + '</td>' +
      '<td class="num">' + (r.total ? Math.round(a.mg / r.total * 100) : 0) + '%</td></tr>';
  }).join('');

  $('#relatorio').innerHTML = indicadores +
    '<div class="cartao"><h2>Consumo por ' + (r.dias.length <= 92 ? 'dia' : 'mês') + '</h2>' + grafico(r, limite) + '</div>' +
    '<div class="cartao"><h2>Alimentos que mais contribuíram</h2><table class="tabela"><thead><tr><th>Alimento</th><th class="num">Vezes</th><th class="num">mg</th><th class="num">%</th></tr></thead><tbody>' +
    tabelaAlimentos + '</tbody></table></div>' +
    '<div class="cartao"><h2>Dias registrados</h2><table class="tabela"><thead><tr><th>Data</th><th class="num">mg</th><th>Situação</th></tr></thead><tbody>' +
    tabelaDias + '</tbody></table></div>';
}

// Barras por dia (ou média por mês em períodos longos), coloridas pela situação, com a linha do limite.
// A largura do desenho acompanha a da tela, para os textos do eixo terem sempre o mesmo tamanho.
function grafico(r, limite) {
  let barras;
  if (r.dias.length <= 92) {
    barras = r.dias.map(function (d) {
      return { rotulo: d.data.slice(8) + '/' + d.data.slice(5, 7), valor: d.total, nivel: d.nivel, dica: formatarCurta(d.data) };
    });
  } else {
    const meses = {};
    r.dias.forEach(function (d) {
      const k = d.data.slice(0, 7);
      meses[k] = meses[k] || { soma: 0, n: 0 };
      if (d.total !== null) { meses[k].soma += d.total; meses[k].n++; }
    });
    barras = Object.keys(meses).map(function (k) {
      const m = meses[k];
      const v = m.n ? arredondar(m.soma / m.n, 1) : null;
      return { rotulo: k.slice(5) + '/' + k.slice(2, 4), valor: v, nivel: v === null ? null : situacaoDoDia(v, limite).nivel, dica: 'Média de ' + k.slice(5) + '/' + k.slice(0, 4) };
    });
  }
  const max = Math.max(limite || 0, Math.max.apply(null, barras.map(function (b) { return b.valor || 0; }))) * 1.1 || 1;
  const L = Math.max(320, Math.min(900, ($('#relatorio').clientWidth || 400) - 34)), A = 210, topo = 10, base = 184, esq = 34;
  const largura = (L - esq) / barras.length;
  const y = function (v) { return base - (v / max) * (base - topo); };
  const passoRotulo = Math.ceil(barras.length / Math.floor(L / 55));
  let svg = '<svg viewBox="0 0 ' + L + ' ' + A + '" class="grafico" role="img" aria-label="Consumo de fenilalanina por ' + (r.dias.length <= 92 ? 'dia' : 'mês') + '">';
  [0, 0.5, 1].forEach(function (f) {
    const v = max / 1.1 * f;
    svg += '<line x1="' + esq + '" x2="' + L + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grade"/>' +
      '<text x="' + (esq - 4) + '" y="' + (y(v) + 4) + '" class="eixo" text-anchor="end">' + Math.round(v) + '</text>';
  });
  barras.forEach(function (b, i) {
    const x = esq + i * largura;
    if (b.valor !== null) {
      const h = Math.max(base - y(b.valor), 1);
      const w = Math.max(largura - 2, 1);
      svg += '<rect x="' + (x + 1) + '" y="' + (base - h) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(4, w / 2) + '" class="barra-' + (b.nivel || 'ok') + '">' +
        '<title>' + b.dica + ': ' + fmt(b.valor) + ' mg' + (limite ? ' (' + NIVEL_TEXTO[b.nivel] + ')' : '') + '</title></rect>';
    }
    if (i % passoRotulo === 0) {
      svg += '<text x="' + (x + largura / 2) + '" y="' + (base + 16) + '" class="eixo" text-anchor="middle">' + b.rotulo + '</text>';
    }
  });
  if (limite) {
    svg += '<line x1="' + esq + '" x2="' + L + '" y1="' + y(limite) + '" y2="' + y(limite) + '" class="linha-limite"/>';
  }
  svg += '</svg>';
  const legenda = limite ? '<div class="legenda"><span><i class="ponto nivel-ok"></i>Dentro</span><span><i class="ponto nivel-atencao"></i>Perto (80% ou mais)</span><span><i class="ponto nivel-acima"></i>Acima</span><span><i class="traco"></i>Limite (' + fmt(limite) + ' mg)</span></div>' : '';
  return svg + legenda + (r.dias.length > 92 ? '<p class="ajuda">Períodos longos mostram a média diária de cada mês.</p>' : '');
}

// ---------- Offline ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}

iniciar().catch(function (e) {
  console.error(e);
  toast('Erro ao abrir os dados do aparelho: ' + e.message);
});
