# ObraControl — Avanço Físico de Obras

Aplicativo web para acompanhamento de **produção física diária**, **medições físicas aprovadas** e **fotografias por item**. Os painéis exibem unidades, metas, saldos e percentuais: **não há preços nem valores em reais**.

## Aplicativo

**Endereço após configurar o GitHub Pages:** https://lionzionion.github.io/obracontrol-avanco-fisico/

Para publicar, acesse **Settings → Pages → Build and deployment → Source → GitHub Actions**. O workflow em `.github/workflows/pages.yml` publicará automaticamente os arquivos a cada atualização da branch `main`.

Para executar localmente, abra o projeto no VS Code com Live Server, ou rode `python -m http.server 8000` e acesse `http://localhost:8000`.

## Como utilizar

1. Selecione a proposta **Demolição e terraplenagem** ou **Gabiões e drenagem**.
2. Entre em **Lançar produção**, escolha o serviço e informe data, quantidade, frente, responsável e observações.
3. Anexe até **6 fotos** ao registro, usando a câmera ou a galeria do celular.
4. Acompanhe **Executado**, **Medido/aprovado**, **Saldo físico**, gráficos e fotos por item.
5. Em **Medições**, registre separadamente a quantidade física aprovada, que não pode ultrapassar a execução.
6. Em **Histórico e backup**, exporte CSV, faça backup JSON com as fotos e restaure seus registros quando necessário.

Itens contratados em **VB** começam com uma meta genérica de 100%. Em **Ajustar meta física**, você pode configurar m³, m², m, t, unidades ou % com uma quantidade prevista.

## Fórmulas

- Avanço executado (%) = executado acumulado / meta × 100.
- Avanço medido (%) = quantidade aprovada acumulada / meta × 100.
- Saldo físico = máx(0, meta − executado).
- Não somamos m³, m², m, t, unidades e % em um indicador de volume único.
- **Medido/aprovado é quantidade física e não equivale a faturamento.**

## Serviços cadastrados

O catálogo `itens.json` contém **70 itens**, extraídos das propostas da obra AMBEV Itapissuma com data de 13/11/2026:

- 13 itens da aba **Proposta** de `PROPOSTA_DEMOLICAO_REV_01_13112026.xlsx`.
- 57 itens da aba **Orçamento** de `PROPOSTA_GABIAO_AMBEV_RL_REVISADA_SOLUTIO_13112026.xlsx`.

Os itens são também incorporados ao `index.html` para permitir execução sem dependências externas. Antes de usar como controle contratual oficial, confira as quantidades e as revisões efetivamente aprovadas.

## Privacidade e limites da versão atual

> **Versão local, sem sincronização entre dispositivos.**

Os lançamentos, fotos e metas personalizadas ficam **somente no IndexedDB de cada navegador**. O GitHub guarda o código-fonte e o catálogo, **não** recebe a produção nem as fotos lançadas. Não há login, permissões de administrador ou banco de dados compartilhado.

Faça **backup JSON regularmente** antes de limpar o navegador ou trocar de aparelho; somente o JSON inclui as fotos. O repositório está **público**, portanto o catálogo de serviços e seus quantitativos podem ser vistos por terceiros. Não publique fotos internas, credenciais ou informações privadas no repositório.

## Próximas versões

- Acesso por usuários (administração, engenheiros e apontadores).
- Banco de dados compartilhado com controle de acesso e armazenamento privado de fotos.
- Aprovação de apontamentos, trilha de auditoria, relatório fotográfico e exportações PDF/Excel.

## Arquivos

- `index.html` — aplicativo completo e responsivo;
- `itens.json` — catálogo dos 70 serviços;
- `manifest.webmanifest`, `icon.svg` e `sw.js` — instalação/uso offline dos arquivos estáticos;
- `.github/workflows/pages.yml` — workflow de publicação no GitHub Pages;
- `README.md` — documentação.

**ObraControl — Engenharia, Produção e Avanço Físico.**
