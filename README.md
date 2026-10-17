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
- **Relatórios:** semana, mês, trimestre, semestre e ano, com média diária (só dos dias registrados), % do limite, dias acima do limite, maior e menor consumo, gráfico por dia (ou média por mês nos períodos longos), alimentos que mais contribuíram e lista de dias. "Gerar PDF" abre a impressão do navegador, onde se escolhe "Salvar como PDF".
- **Perfil:** vários perfis com limite diário próprio; criar, editar e excluir (excluir apaga o histórico do perfil).
- **Planilhas:** backup completo em Excel (.xlsx, abas Alimentos, Registros, Perfis e Instruções) e importação com mesclagem pela data de alteração (vale a versão mais recente de cada item; exclusões também são levadas). Modelo de planilha para cadastrar vários alimentos de uma vez. Backups antigos em JSON ainda são aceitos. A leitura e a gravação de .xlsx são feitas por `js/xlsx.js`, sem bibliotecas.

## Base pré-cadastrada (ANVISA)

A base inicial vem do painel público da ANVISA "Conteúdo de fenilalanina em alimentos": cerca de 3.060 produtos com categoria, nome, marca e quantidade máxima de fenilalanina (mg/100 g). O arquivo fica em `data/anvisa.json` e é carregado na primeira abertura do app.

Para atualizar com a versão mais nova do painel:

```bash
node tools/importar-anvisa.mjs
```

O script unifica grafias diferentes de categoria, corrige linhas com categoria e nome trocados e dá a cada item um id fixo, igual em todos os aparelhos, para a sincronização não duplicar a base. Quando o app recebe uma base nova, só entram os itens que o aparelho ainda não tem; edições e exclusões feitas pelo usuário são mantidas.

A tabela é voltada a produtos industrializados e alimentos in natura de baixo teor. Itens como feijão e ovo não aparecem nela e podem ser cadastrados pelo usuário.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html`, `css/style.css` | Telas e estilo (responsivo, letras grandes, tema claro) |
| `js/app.js` | Interface |
| `js/model.js` | Regras puras: cálculo de mg, estimativa, situação do dia, mesclagem |
| `js/db.js` | IndexedDB (alimentos, registros, perfis, config) |
| `js/xlsx.js`, `js/planilha.js` | Gerar e ler planilhas Excel; colunas do backup e do modelo |
| `js/seed.js`, `data/anvisa.json` | Base pré-cadastrada da ANVISA |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalação e funcionamento offline |
| `tools/serve.mjs` | Servidor local; `tools/make-icons.mjs` gera os PNG; `tools/importar-anvisa.mjs` baixa a base |

## Modelo de dados

- **Alimento:** id, categoria, nome, marca, pheMg100, proteinaG100, fonte (`tabela`, `rotulo`, `estimativa`), porcaoNome, porcaoG, favorito, updatedAt, deleted.
- **Registro:** id, perfilId, data, hora, refeição, alimentoId, alimentoNome, pheMg100, unidade, qtdInformada, quantidadeG, pheMg, updatedAt, deleted. O nome, o teor e os mg ficam gravados no registro, então editar a base não altera o histórico.
- **Perfil:** id, nome, limiteMg, updatedAt, deleted.

## Publicar

Para instalar no celular, o app precisa estar em HTTPS. Qualquer hospedagem estática gratuita serve (GitHub Pages, Netlify, Cloudflare Pages), basta enviar a pasta como está.
