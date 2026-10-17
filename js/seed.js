// Base inicial de exemplo, carregada só na primeira abertura do app.
// Valores ESTIMADOS a partir da proteína (aprox. TACO) × 50 mg; servem para testar o app
// e devem ser substituídos pela tabela de fenilalanina da ANVISA ou pelo rótulo.
import { normalizarAlimento } from './model.js';

const EXEMPLOS = [
  ['Cereais', 'Arroz branco cozido', 2.5, '1 colher de servir', 45],
  ['Leguminosas', 'Feijão carioca cozido', 4.8, '1 concha', 80],
  ['Tubérculos', 'Batata inglesa cozida', 1.2, '1 unidade média', 130],
  ['Frutas', 'Banana prata', 1.3, '1 unidade', 55],
  ['Frutas', 'Maçã', 0.3, '1 unidade', 130],
  ['Frutas', 'Mamão papaya', 0.5, '1/2 unidade', 150],
  ['Hortaliças', 'Cenoura crua', 1.3, '1 colher de sopa ralada', 12],
  ['Hortaliças', 'Alface crua', 1.3, '1 folha', 10],
  ['Hortaliças', 'Tomate cru', 1.1, '1 fatia', 15],
  ['Panificados', 'Pão francês', 8.0, '1 unidade', 50],
  ['Laticínios', 'Leite de vaca integral', 3.0, '1 copo', 200],
  ['Ovos', 'Ovo de galinha cozido', 13.3, '1 unidade', 50],
  ['Açúcares', 'Açúcar refinado', 0.3, '1 colher de chá', 5],
  ['Óleos', 'Óleo de soja', 0, '1 colher de sopa', 8]
];

export function alimentosIniciais() {
  return EXEMPLOS.map(function (e) {
    return normalizarAlimento({
      categoria: e[0], nome: e[1], marca: '', proteinaG100: e[2],
      porcaoNome: e[3], porcaoG: e[4], fonte: 'estimativa'
    });
  });
}
