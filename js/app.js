import * as db from './db.js';
import {
  REFEICOES, FONTES, novoId, agoraIso, dataLocal, horaLocal, somarDias, arredondar,
  normalizarAlimento, calcularPhe, situacaoDoDia, totalPhe, mesclar, buscarTexto, semAcento
} from './model.js';
import { alimentosIniciais } from './seed.js';

const estado = {
  perfil: null,
  data: dataLocal(),
  alimentos: []
};

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
  if (id === 'tela-alimentos') renderAlimentos();
  if (id === 'tela-dados') renderDados();
  window.scrollTo(0, 0);
}

// ---------- Inicialização ----------
async function iniciar() {
  if (!(await db.lerConfig('semeado'))) {
    await db.salvarVarios('alimentos', alimentosIniciais());
    await db.gravarConfig('semeado', true);
  }
  let perfis = await db.todos('perfis');
  if (!perfis.length) {
    const p = { id: novoId(), nome: 'Meu perfil', limiteMg: null, updatedAt: agoraIso(), deleted: false };
    await db.salvar('perfis', p);
    perfis = [p];
  }
  const ativoId = await db.lerConfig('perfilAtivo');
  estado.perfil = perfis.find(function (p) { return p.id === ativoId; }) || perfis[0];
  await carregarAlimentos();
  atualizarChipPerfil();
  renderHoje();
}

async function carregarAlimentos() {
  estado.alimentos = (await db.todos('alimentos')).sort(function (a, b) {
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
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
        '<label class="campo">Quantidade<input type="number" id="f-qtd" inputmode="decimal" min="0" step="any"></label>' +
        '<label class="campo">Unidade<select id="f-unidade"></select></label>' +
      '</div>' +
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
      (a.favorito ? ' ★' : '') + '</div><div class="detalhe">' + esc([a.marca, a.categoria].filter(Boolean).join(' · ')) + '</div></div>' +
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
      html += '<li class="secao-titulo">Todos</li>' + estado.alimentos.map(itemLista).join('');
    } else {
      const achados = estado.alimentos.filter(function (a) { return buscarTexto(a).indexOf(termo) >= 0; });
      html = achados.length ? achados.map(itemLista).join('')
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
    const temPorcao = a.porcaoG > 0;
    $('#f-unidade').innerHTML = '<option value="g">gramas</option>' +
      (temPorcao ? '<option value="porcao">' + esc(a.porcaoNome || 'porção') + ' (' + fmt(a.porcaoG) + ' g)</option>' : '');
    if (editando) {
      $('#f-unidade').value = registro.unidade === 'porcao' && temPorcao ? 'porcao' : 'g';
      $('#f-qtd').value = $('#f-unidade').value === 'porcao' ? registro.qtdInformada : registro.quantidadeG;
    } else {
      $('#f-unidade').value = temPorcao ? 'porcao' : 'g';
      $('#f-qtd').value = temPorcao ? 1 : '';
    }
    atualizarPrevia();
    $('#f-qtd').focus();
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
  $('#f-unidade').addEventListener('change', atualizarPrevia);

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
  const lista = estado.alimentos.filter(function (a) { return !termo || buscarTexto(a).indexOf(termo) >= 0; });
  $('#lista-alimentos').innerHTML = lista.length ? lista.map(function (a) {
    return '<li><button type="button" class="estrela" data-fav="' + a.id + '" aria-label="' + (a.favorito ? 'Remover dos favoritos' : 'Favoritar') + '">' +
      (a.favorito ? '★' : '☆') + '</button>' +
      '<div class="info clicavel" data-editar="' + a.id + '"><div class="nome">' + esc(a.nome) + '</div>' +
      '<div class="detalhe">' + esc([a.marca, a.categoria].filter(Boolean).join(' · ')) +
      (a.porcaoG ? ' · ' + esc(a.porcaoNome || 'porção') + ' = ' + fmt(a.porcaoG) + ' g' : '') + ' ' +
      '<span class="selo' + (a.fonte === 'estimativa' ? ' estimativa' : '') + '">' + esc(a.fonte === 'estimativa' ? 'estimado' : FONTES[a.fonte]) + '</span></div></div>' +
      '<div class="valor">' + fmt(a.pheMg100) + '<span class="detalhe"> mg/100 g</span></div></li>';
  }).join('') : '<li class="vazio">Nenhum alimento encontrado.</li>';

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
    '<label class="campo">Fonte do dado<select id="a-fonte">' + Object.keys(FONTES).map(function (k) {
      return '<option value="' + k + '"' + ((ed.fonte || 'rotulo') === k ? ' selected' : '') + '>' + FONTES[k] + '</option>';
    }).join('') + '</select></label>' +
    '<div class="linha">' +
      '<label class="campo">Porção padrão<input id="a-porcao" placeholder="ex.: 1 fatia" value="' + esc(ed.porcaoNome) + '"></label>' +
      '<label class="campo">Gramas da porção<input id="a-porcao-g" type="number" inputmode="decimal" min="0" step="any" value="' + (ed.porcaoG || '') + '"></label>' +
    '</div>' +
    '<div class="modal-rodape">' +
      (a ? '<button type="button" class="btn perigo esquerda" id="a-excluir">Excluir</button>' : '') +
      '<button type="button" class="btn" data-fechar>Cancelar</button>' +
      '<button type="button" class="btn primario" id="a-salvar">Salvar</button>' +
    '</div>');

  // Ao editar só a proteína de um item estimado, o teor precisa ser recalculado.
  const pheOriginal = ed.pheMg100;
  $('#a-salvar').onclick = async function () {
    let phe = $('#a-phe').value;
    if (ed.fonte === 'estimativa' && $('#a-fonte').value === 'estimativa' && String(phe) === String(pheOriginal) &&
        $('#a-prot').value !== String(ed.proteinaG100)) phe = '';
    try {
      const novo = normalizarAlimento({
        nome: $('#a-nome').value, categoria: $('#a-categoria').value, marca: $('#a-marca').value,
        pheMg100: phe, proteinaG100: $('#a-prot').value, fonte: $('#a-fonte').value,
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
    '<div class="modal-rodape"><button type="button" class="btn" data-fechar>Cancelar</button>' +
    '<button type="button" class="btn primario" id="p-salvar">Salvar</button></div>');
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

// ---------- Exportar / importar backup ----------
$('#exportar').addEventListener('click', async function () {
  const dados = { app: 'controle-fenilalanina', versao: 1, exportadoEm: agoraIso() };
  for (const nome of db.LOJAS) dados[nome] = await db.todosComExcluidos(nome);
  const blob = new Blob([JSON.stringify(dados)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fenilalanina-backup-' + dataLocal() + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  await db.gravarConfig('ultimoBackup', agoraIso());
  renderDados();
});

$('#importar-arquivo').addEventListener('change', async function (e) {
  const arquivo = e.target.files[0];
  e.target.value = '';
  if (!arquivo) return;
  try {
    const dados = JSON.parse(await arquivo.text());
    if (dados.app !== 'controle-fenilalanina') throw new Error('Este arquivo não é um backup deste app.');
    const resumo = [];
    for (const nome of db.LOJAS) {
      const r = mesclar(await db.todosComExcluidos(nome), Array.isArray(dados[nome]) ? dados[nome] : []);
      await db.salvarVarios(nome, r.itens);
      resumo.push(nome + ': ' + r.novos + ' novos, ' + r.atualizados + ' atualizados');
    }
    await carregarAlimentos();
    const perfis = await db.todos('perfis');
    estado.perfil = perfis.find(function (p) { return p.id === estado.perfil.id; }) || perfis[0];
    atualizarChipPerfil();
    renderDados();
    toast('Importado. ' + resumo.join(' · '));
  } catch (err) {
    toast('Não foi possível importar: ' + err.message);
  }
});

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
