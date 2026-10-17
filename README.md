# Controle de Fenilalanina

App web instalável (PWA) para registrar o consumo diário de fenilalanina (Phe). Funciona offline em Android, iPhone e PC, e os dados ficam só no aparelho (IndexedDB), sem servidor nem banco online.

> Este app é um apoio e não substitui a orientação da equipe de saúde.

## Rodar localmente

Requer Node 18 ou mais novo, sem instalar dependências.

```bash
npm start
```

Abra http://localhost:8080. Testes das regras de cálculo e mesclagem:

```bash
npm test
```

## O que já existe

- **Hoje:** registro por refeição (busca, favoritos, recentes, gramas ou porções), total do dia, quanto falta e barra verde/amarelo/vermelho em relação ao limite; editar, excluir e "repetir de ontem"; navegação entre dias.
- **Alimentos:** cadastrar, editar, excluir e favoritar. Sem o teor de Phe, o app estima pela proteína (× 50 mg/g) e marca como estimado.
- **Perfil e dados:** vários perfis com limite diário próprio; exportar e importar backup em JSON com mesclagem pela data de alteração (vale a versão mais recente de cada item; exclusões também são levadas).

A base inicial tem 14 alimentos de exemplo com teor **estimado** pela proteína, só para teste. Ela deve ser trocada pela tabela da ANVISA ou por valores de rótulo.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html`, `css/style.css` | Telas e estilo (responsivo, letras grandes, tema escuro automático) |
| `js/app.js` | Interface |
| `js/model.js` | Regras puras: cálculo de mg, estimativa, situação do dia, mesclagem |
| `js/db.js` | IndexedDB (alimentos, registros, perfis, config) |
| `js/seed.js` | Base de exemplo |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalação e funcionamento offline |
| `tools/serve.mjs` | Servidor local; `tools/make-icons.mjs` gera os PNG |

## Modelo de dados

- **Alimento:** id, categoria, nome, marca, pheMg100, proteinaG100, fonte (`tabela`, `rotulo`, `estimativa`), porcaoNome, porcaoG, favorito, updatedAt, deleted.
- **Registro:** id, perfilId, data, hora, refeição, alimentoId, alimentoNome, pheMg100, unidade, qtdInformada, quantidadeG, pheMg, updatedAt, deleted. O nome, o teor e os mg ficam gravados no registro, então editar a base não altera o histórico.
- **Perfil:** id, nome, limiteMg, updatedAt, deleted.

## Publicar

Para instalar no celular, o app precisa estar em HTTPS. Qualquer hospedagem estática gratuita serve (GitHub Pages, Netlify, Cloudflare Pages), basta enviar a pasta como está.
