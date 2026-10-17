// Acesso ao IndexedDB: os dados ficam só no aparelho.
// Itens excluídos não somem do banco; viram "lápide" (deleted: true) para a sincronização por arquivo.

const NOME_BANCO = 'fenilalanina';
const VERSAO = 1;
export const LOJAS = ['alimentos', 'registros', 'perfis'];

let conexao = null;

function abrir() {
  if (conexao) return Promise.resolve(conexao);
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(NOME_BANCO, VERSAO);
    req.onupgradeneeded = function () {
      const db = req.result;
      db.createObjectStore('alimentos', { keyPath: 'id' });
      const reg = db.createObjectStore('registros', { keyPath: 'id' });
      reg.createIndex('perfilData', ['perfilId', 'data']);
      db.createObjectStore('perfis', { keyPath: 'id' });
      db.createObjectStore('config', { keyPath: 'chave' });
    };
    req.onsuccess = function () { conexao = req.result; resolve(conexao); };
    req.onerror = function () { reject(req.error); };
  });
}

function pedido(req) {
  return new Promise(function (resolve, reject) {
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function loja(nome, modo) {
  return abrir().then(function (db) {
    return db.transaction(nome, modo || 'readonly').objectStore(nome);
  });
}

// Todos os itens, inclusive lápides (usado na exportação).
export function todosComExcluidos(nome) {
  return loja(nome).then(function (s) { return pedido(s.getAll()); });
}

export function todos(nome) {
  return todosComExcluidos(nome).then(function (l) { return l.filter(function (i) { return !i.deleted; }); });
}

export function obter(nome, id) {
  return loja(nome).then(function (s) { return pedido(s.get(id)); });
}

export function salvar(nome, item) {
  return loja(nome, 'readwrite').then(function (s) { return pedido(s.put(item)); }).then(function () { return item; });
}

export function salvarVarios(nome, itens) {
  if (!itens.length) return Promise.resolve();
  return abrir().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(nome, 'readwrite');
      const s = tx.objectStore(nome);
      itens.forEach(function (i) { s.put(i); });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

export function excluir(nome, id) {
  return obter(nome, id).then(function (item) {
    if (!item) return;
    item.deleted = true;
    item.updatedAt = new Date().toISOString();
    return salvar(nome, item);
  });
}

export function registrosDoDia(perfilId, data) {
  return loja('registros').then(function (s) {
    return pedido(s.index('perfilData').getAll([perfilId, data]));
  }).then(function (l) { return l.filter(function (i) { return !i.deleted; }); });
}

export function lerConfig(chave) {
  return loja('config').then(function (s) { return pedido(s.get(chave)); })
    .then(function (r) { return r ? r.valor : undefined; });
}

export function gravarConfig(chave, valor) {
  return loja('config', 'readwrite').then(function (s) { return pedido(s.put({ chave: chave, valor: valor })); });
}
