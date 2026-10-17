// Base pré-cadastrada: tabela "Conteúdo de fenilalanina em alimentos" da ANVISA,
// gerada por tools/importar-anvisa.mjs em data/anvisa.json.

// Itens de exemplo da primeira versão (teor estimado), removidos quando a base da ANVISA entra.
export const NOMES_EXEMPLO = [
  'Arroz branco cozido', 'Feijão carioca cozido', 'Batata inglesa cozida', 'Banana prata', 'Maçã',
  'Mamão papaya', 'Cenoura crua', 'Alface crua', 'Tomate cru', 'Pão francês', 'Leite de vaca integral',
  'Ovo de galinha cozido', 'Açúcar refinado', 'Óleo de soja'
];

// Devolve a versão da base (data de download) e os alimentos no formato do app.
// A data de alteração de cada item é a do download: uma edição feita pelo usuário fica mais recente
// e, na sincronização, prevalece sobre o valor original da tabela.
export function carregarBaseAnvisa() {
  return fetch('data/anvisa.json').then(function (r) {
    if (!r.ok) throw new Error('Base da ANVISA indisponível (' + r.status + ').');
    return r.json();
  }).then(function (d) {
    return {
      versao: d.baixadoEm,
      alimentos: d.alimentos.map(function (a) {
        return {
          id: a.id, categoria: a.categoria, nome: a.nome, marca: a.marca,
          pheMg100: a.pheMg100, proteinaG100: null, fonte: 'tabela',
          porcaoNome: '', porcaoG: null, favorito: false,
          updatedAt: d.baixadoEm, deleted: false
        };
      })
    };
  });
}
