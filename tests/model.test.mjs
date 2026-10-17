import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPhe, normalizarAlimento, situacaoDoDia, mesclar, somarDias, totalPhe } from '../js/model.js';

test('calcula mg de Phe por gramas e teor', function () {
  assert.equal(calcularPhe(50, 400), 200);
  assert.equal(calcularPhe(0, 400), 0);
  assert.equal(calcularPhe(33, 125), 41.3);
});

test('estima o teor pela proteína quando falta e marca como estimativa', function () {
  const a = normalizarAlimento({ nome: 'Arroz', proteinaG100: '2,5', fonte: 'tabela' });
  assert.equal(a.pheMg100, 125);
  assert.equal(a.fonte, 'estimativa');
});

test('mantém o teor informado e exige nome e algum valor', function () {
  const a = normalizarAlimento({ nome: 'Pão', pheMg100: 380, proteinaG100: 8, fonte: 'rotulo' });
  assert.equal(a.pheMg100, 380);
  assert.equal(a.fonte, 'rotulo');
  assert.throws(function () { normalizarAlimento({ nome: '', pheMg100: 1 }); });
  assert.throws(function () { normalizarAlimento({ nome: 'X' }); });
});

test('situação do dia: verde, amarelo e vermelho', function () {
  assert.equal(situacaoDoDia(100, 300).nivel, 'ok');
  assert.equal(situacaoDoDia(250, 300).nivel, 'atencao');
  assert.equal(situacaoDoDia(301, 300).nivel, 'acima');
  assert.equal(situacaoDoDia(301, 300).restante, -1);
  assert.equal(situacaoDoDia(50, null).nivel, 'sem-limite');
});

test('mescla mantém a versão mais recente de cada item, inclusive exclusões', function () {
  const locais = [
    { id: 'a', nome: 'velho', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'b', nome: 'local mais novo', updatedAt: '2026-03-01T00:00:00Z' }
  ];
  const importados = [
    { id: 'a', nome: 'novo', updatedAt: '2026-02-01T00:00:00Z' },
    { id: 'b', nome: 'importado antigo', updatedAt: '2026-02-01T00:00:00Z' },
    { id: 'c', nome: 'inédito', updatedAt: '2026-02-01T00:00:00Z' },
    { id: 'a2', deleted: true, updatedAt: '2026-02-01T00:00:00Z' }
  ];
  const r = mesclar(locais, importados);
  assert.equal(r.novos, 2);
  assert.equal(r.atualizados, 1);
  assert.equal(r.ignorados, 1);
  assert.deepEqual(r.itens.map(function (i) { return i.id; }), ['a', 'c', 'a2']);
});

test('datas e totais', function () {
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(totalPhe([{ pheMg: 10.25 }, { pheMg: 5 }]), 15.3);
});
