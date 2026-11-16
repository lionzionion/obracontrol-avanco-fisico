# RL Central de Obras — Painel Executivo (MVP 1)

Aplicação web **somente leitura**, integrada aos dois aplicativos RL já em operação na obra AMBEV Itapissuma.

## Acesso

- Endereço após o deploy: https://lionzionion.github.io/obracontrol-avanco-fisico/central/
- Autenticação: usuários administradores ativos no mesmo Supabase Auth do RL Pedidos e ObraControl.
- Código público não contém senhas, service_role ou fotografias; usa exclusivamente a chave **publishable** e RLS existente.
- Colaboradores e contas restaurante **não** recebem acesso à Central.

## Módulos existentes

1. Visão executiva: serviços iniciados, lançamentos do período, fotos, refeições e atividade diária (número de apontamentos).
2. Produção e medições: itens, metas, execução acumulada, medições aprovadas, quantidades do período, diário e exportação CSV.
3. Registro fotográfico: fotos reais do bucket privado `obc-fotos`, via URLs assinadas temporárias.
4. Alimentação e equipe: pedidos ativos separados por empresa, subtotal de refeições sem fretes e quantitativo de funcionários **cadastrados**, não presentes.
5. Relatório gerencial: documento com dados reais, serviços executados, registros, fotos e ressalvas; botão imprimir/salvar como PDF.

## Fonte dos dados

Projeto Supabase compartilhado `AMBEV Pedidos RL`: `obc_items`, `obc_entries`, `obc_configs`, `obc_photos`, `orders`, `profiles` e Storage privado `obc-fotos`. O dashboard **nunca grava ou exclui registros**. A autenticação e as permissões continuam sob RLS da aplicação original.

## Critérios de engenharia

- Execução de serviço (%) = executado acumulado / meta física revisada.
- O acumulado considera os lançamentos até a data final do filtro.
- Não existe percentual global, Curva S, prazo previsto, presença real nem produtividade por homem-hora sem fontes e critérios adicionais.
- Não somar m², m³, m, t e unidades como se representassem um único volume.
- O gráfico de atividade diária mostra **número de apontamentos**, não soma de quantitativos heterogêneos.
- Refeições excluem cancelados e arquivados; subtotal monetário exclui fretes e rateios.
- A aplicação consulta registros existentes; alguns podem ser testes da fase de homologação.

## Publicação

O site está incluído como pasta adicional no workflow GitHub Pages do ObraControl. A inclusão de `central/` não muda as telas nem a lógica dos aplicativos originais.

## Próximas etapas

- Perfil dedicado de diretoria somente leitura no banco, com novas políticas RLS auditadas.
- Importação do cronograma e ponderação contratual para Curva S real.
- Cadastro de obras/frentes para gestão multiobras.
- RDO e equipe presente em campo, distinguindo-se de colaboradores cadastrados.
- Repositório exclusivo `rl-central-obras` quando estiver disponível sua criação no GitHub.

**RL Engenharia • Fazendo Acontecer**