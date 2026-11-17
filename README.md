# RL Engenharia | ObraControl — acompanhamento físico de obras

Aplicativo web para **apontamento diário de serviços**, **volumes e percentuais**, **medições aprovadas** e **fotografias por item** da obra AMBEV Itapissuma. A interface de produção não exibe valores monetários. O módulo privado **BMs** mostra os valores oficiais apenas a administradores autenticados.


## Identidade visual RL Engenharia

Todas as telas usam a marca RL Engenharia, com o lema **Fazendo Acontecer** e a paleta azul/verde fornecida como referência.

- Tela de entrada e autenticação com cabeçalho RL.
- Menu desktop, cabeçalho responsivo no celular, painéis, formulários, histórico, medições e galeria fotográfica.
- Diálogos de detalhes, configuração de metas e visualização de fotografias.
- Ícone, manifesto instalável e cache estático com nome **RL Obras**.
- Identidade visual separada da lógica de produção para facilitar manutenções futuras.

**Arquivos visuais:** \`assets/rl-logo.svg\`, \`icon.svg\`, \`rl-theme.css\` e \`rl-brand.js\`. A marca SVG é uma versão vetorial baseada no layout, nas cores e no lema da referência visual enviada; o arquivo original de imagem fornecido não é armazenado neste repositório.

## Situação da implantação

- ✅ **Código no GitHub**: [lionzionion/obracontrol-avanco-fisico](https://github.com/lionzionion/obracontrol-avanco-fisico)
- ✅ **Banco Supabase** conectado ao projeto existente **AMBEV Pedidos RL** (São Paulo), usando tabelas independentes com prefixo `obc_`.
- ✅ **70 serviços** cadastrados e disponíveis no banco: 13 de demolição/terraplenagem e 57 de gabiões/drenagem.
- ✅ **Produção, medições e metas** persistidas no PostgreSQL com regras de acesso RLS.
- ✅ **Fotos em bucket privado**, com links temporários gerados para cada sessão autenticada.
- ✅ **Login reutilizado** do aplicativo AMBEV Pedidos RL; colaboradores ativos registram produção e administradores aprovam medições.
- ⏳ **Hospedagem pública pendente**: é necessário ativar manualmente o GitHub Pages em [Settings → Pages](https://github.com/lionzionion/obracontrol-avanco-fisico/settings/pages), selecionando **GitHub Actions**. A conexão do GitHub não tem permissão para ativá-lo por conta própria.
- ⚠️ A Vercel desta conta retornou bloqueio de criação por pendência de pagamento. Não alteramos a conta nem desativamos projetos ativos.

### Link do aplicativo

Após ativar o GitHub Pages e executar novamente o workflow **Validar e publicar ObraControl** em **Actions**, o endereço esperado é:

https://lionzionion.github.io/obracontrol-avanco-fisico/

**Não considere esse endereço ativo antes de aparecer uma execução verde do workflow e a página abrir no navegador.**

## Login e permissões

O ObraControl utiliza o mesmo Supabase Auth do aplicativo de pedidos da equipe, sem modificar contas ou senhas existentes.

- **Administrador ativo**: registra produção, aprova medições, **edita/corrige lançamentos de produção e medição**, altera metas e exclui lançamentos.
- **Colaborador ativo**: consulta todos os itens, registra produção e adiciona fotografias.
- **Restaurante / conta inativa / visitante sem login**: sem acesso ao banco do ObraControl.

Na tela de entrada, use seu **usuário de acesso** (ou e-mail) e sua **senha já cadastrada** no sistema AMBEV Pedidos RL. Não existe cadastro público automático. Esse modelo permite acesso **de qualquer aparelho com internet, mas apenas por pessoas autorizadas**.

## Fluxo diário

1. Entre no link pelo celular ou computador e faça login.
2. Selecione **Gabiões e drenagem** ou **Demolição e terraplenagem**.
3. Em **Lançar produção**, busque o item pelo código ou nome.
4. Preencha data, quantidade, frente de serviço, responsável e observações.
5. Tire fotos com a câmera ou selecione da galeria (até seis por lançamento).
6. Clique em **Salvar lançamento**. Os dados e fotos são enviados para a nuvem.
7. Confira o avanço em **Visão geral** e as fotos em **Serviços e fotos**.
8. Um administrador pode registrar separadamente **Medição aprovada**.
9. Utilize **Atualizar** para sincronizar imediatamente; a interface também consulta automaticamente a nuvem durante o uso.

**Produção executada** e **medição aprovada** são quantidades físicas separadas, nunca valores faturados.

## Correção de lançamentos existentes

Para corrigir um percentual lançado incorretamente (ex.: **59%**) sem apagar fotos nem o histórico:

1. Acesse **Medições** e localize o card do serviço. Na seção **Lançamentos do serviço**, cada produção ou medição registrada tem o botão **✎ Editar** para administradores.
2. Alternativamente, use **Dados → Histórico** ou **Serviços e fotos → Fotos / detalhes** para encontrar o mesmo lançamento.
3. Clique em **Editar**, confira a quantidade original e altere a data, a quantidade (por exemplo, de 59 para 55 quando a unidade for %) ou os campos descritivos.
4. Selecione **Salvar correção**. Os totais, percentuais e barras são recalculados a partir dos lançamentos na nuvem, e as fotografias existentes continuam vinculadas ao registro.
5. O histórico indica **CORRIGIDO**; a data e o usuário da última correção são armazenados no banco.

**Permissões e consistência:** somente administradores ativos podem alterar registros já existentes. Não é permitido alterar o serviço, o tipo (produção/medição) ou a autoria original. A correção de uma medição não pode superar a produção acumulada; a correção de produção não pode deixá-la abaixo do volume já medido. A operação é salva na nuvem, não apenas no dispositivo.

## RDOs e Relatórios — Diário de Obra com fotos reais

A aba **RDOs e Relatórios** prepara um **Relatório Diário de Obra** a partir dos registros do dia e de informações incluídas diretamente no RDO, independentemente de lançamentos de produção ou medição. Preserva todas as informações já registradas, não altera BMs, nem usa ferramentas de IA para inventar dados de engenharia.

### Como usar

1. Faça login e abra **RDOs e Relatórios** no menu (desktop ou celular).
2. Selecione a **data de referência** e clique **Abrir dia**.
3. O RDO carrega os **lançamentos de produção daquela data**, somando quantidades do mesmo item e frente; também carrega fotos vinculadas a **qualquer apontamento da data**, mesmo que o upload tenha ocorrido em dia posterior.
4. Revise as **descrições técnicas de cada serviço**. Quantidades são lidas dos lançamentos existentes; para corrigir números, use o fluxo de **Editar lançamento** do ObraControl e clique **Atualizar registros do dia** no RDO.
5. Clique **+ Adicionar atividade avulsa** para registrar uma atividade sem item contratual. Informe título, frente/local, responsável e descrição; esses registros **não alteram quantidades, medições ou avanço físico**. Podem ser removidos antes da aprovação. A atualização dos registros do dia preserva as atividades adicionadas.
6. Complete os dados que não existem nos apontamentos: **clima, turno, efetivo, equipamentos, segurança, ocorrências, observações e responsável técnico**. Informações desconhecidas ficam em branco, nunca são inferidas só por fotografia.
7. Na galeria, use **Adicionar fotos diretamente ao RDO** para anexar imagens sem item ou apontamento. O RDO é salvo automaticamente antes do upload; as fotos ficam em bucket privado independente `obc-rdo-photos`. É possível enviar até 12 imagens por vez, totalizando até 50, e remover fotos avulsas enquanto o relatório está editável. Na galeria, **selecione quais fotos incluir, edite legendas e altere a ordem**; depois clique **Salvar rascunho**.
8. Clique **Gerar PDF de prévia** para baixar um A4 com a marca RL, datas, serviços, quantidades e imagens reais. A prévia possui identificação de rascunho.
9. Informe o **engenheiro responsável**, clique **Salvar rascunho** e **Enviar para aprovação**. O status passa a **Aguardando aprovação** e o conteúdo é bloqueado para revisão.
10. Um **administrador ativo** escolhe **Aprovar RDO** (observação opcional) ou **Devolver para ajuste** (justificativa obrigatória). O nome, cargo e horário são identificados pelo perfil autenticado e registrados no servidor.
11. Quando aprovado, o sistema gera e arquiva um **PDF privado com a logomarca vetorial RL incorporada como imagem e o nome, cargo, data e hora do aprovador no rodapé de aprovação**. Se houver falha na geração após a decisão, permanece aprovado e oferece **Arquivar PDF aprovado** para concluir o arquivo.
12. Use o **Histórico de RDOs** para consultar o status, visualizar quem aprovou e baixar o PDF arquivado.

**Quem pode fazer o quê:** colaboradores ativos consultam RDOs. Administradores ativos podem criar rascunhos, enviá-los para análise, aprovar ou devolver com motivo. O RDO enviado é somente leitura até a decisão, e o **aprovado é imutável**. Um rascunho devolvido pode ser corrigido e reenviado. A numeração é automática; há um RDO por data para toda a obra (gabiões e demolição). A aprovação é **manual**, não agendada automaticamente ao fim do dia.

**Fonte das fotos:** as fotos automáticas vêm de `obc_photos` vinculadas a `obc_entries`; usam a `work_date` do apontamento, não a data de upload/EXIF. As fotos avulsas ficam em `obc-rdo-photos` e seus caminhos constam somente do manifesto JSON do `obc_rdos`, **sem registro em `obc_entries` ou `obc_photos`**. Fotos anexadas a medições da mesma data aparecem como evidência e não adicionam quantitativos. A área da diretoria também consulta ambos os tipos de foto com URLs temporárias.

**PDF e segurança:** a logomarca existente em `assets/rl-logo.svg` é convertida em PNG para ser incorporada em cada página do PDF. O documento registra o **aprovador identificado via perfil Supabase**, a função e o carimbo de hora do servidor (exibição no fuso de Recife), além de observações. Relatórios aprovados ficam no bucket privado `obc-rdo-pdfs` e podem ser baixados por usuários ativos autorizados. Trata-se de aprovação **interna**, não assinatura digital nem aceite formal da Solutio. A biblioteca jsPDF é carregada por HTTPS; o PDF aprovado precisa de conexão e de todas as imagens selecionadas acessíveis.

**Banco:** `public.obc_rdos` mantém data, número, atividades, fotografias, identidade e carimbo do aprovador, justificativa de devolução e trilha de decisões imutável. Migrações: `supabase/migrations/20261116222538_obracontrol_daily_reports_rdo_v1.sql`, `supabase/migrations/20261116224909_obracontrol_rdo_approval_workflow_v2.sql` e `supabase/migrations/20261117140500_obracontrol_rdo_photos_independentes.sql`. O novo bucket aceita JPEG até 4 MB após compressão, com leitura para equipe ativa e inserção/exclusão restritas a administradores em RDOs editáveis. Teste automatizado: `node tests/rdo-manual.test.cjs`.

---

## Controle de BMs (integração com a Solutio)

O módulo **BMs**, restrito a administradores, mantém as medições oficiais em um livro separado dos apontamentos diários (sem duplicar serviços). A importação inicial dos quatro PDFs inclui **32 linhas com medições positivas**; as demais continuam representadas como zero. **Os PDFs anexados nesta conversa ainda precisam ser enviados pelo botão Anexar PDF no aplicativo**, para ficarem no bucket privado. Nenhuma planilha de custos ou PDF foi colocado no repositório público.

| Boletim | Contrato | Status no aplicativo | Valor da medição no PDF |
| --- | --- | --- | ---: |
| BM 01 | Gabiões e drenagem | Aprovado, conforme informação da gestão | R$ 132.161,06 |
| BM 02 | Gabiões e drenagem | Aprovado, conforme informação da gestão | R$ 658.176,33 |
| BM 03 | Gabiões e drenagem | **Pendente** | R$ 306.965,72 |
| BM 01 | Demolição e terraplenagem | **Prévia — não aprovada** | R$ 119.828,80 |

Para o serviço **B.2.1**, o BM 01 mediu **0,10 (10%)** e o BM 02 mediu **0,20 (20%)**, resultando em **0,30 (30%) aprovado**; o BM 03 contém **0,20 pendente**, que não entra na soma aprovada. O acumulado é calculado a partir da **medição incremental atual de cada BM**, nunca pela soma dos campos "Total acumulado" de cada PDF.

**Aditivos:** a seção ADITIVOS do BM 03 contém códigos repetidos do contrato-base. Seus itens foram registrados em seção distinta, sem vínculo automático ao serviço original. Na prévia de Demolição, o item 5.2 não aparece no catálogo atual de 70 itens e foi preservado como não vinculado, para conferência.

O aplicativo permite anexar ou abrir PDFs privados, exportar CSV, adicionar BMs futuros como prévia, conferir valores e corrigir quantitativos de BMs não aprovados. Um BM aprovado tem suas linhas bloqueadas contra edição. A passagem de pendente para aprovado exige confirmação do administrador. O sistema alerta quando o acumulado anterior informado no PDF diverge dos BMs anteriores aprovados.

**Segurança:** tabelas `obc_bms` e `obc_bm_lines` protegidas por RLS, acesso exclusivo para administradores ativos. Documentos armazenados no bucket privado `obc-bm-pdfs`; URLs assinadas e temporárias. Os lançamentos de produção e medição já existentes em `obc_entries` não foram alterados.

## Quantidades, percentuais e metas

- Avanço executado (%) = quantidade executada acumulada ÷ meta física × 100;
- Avanço medido (%) = quantidade aprovada acumulada ÷ meta física × 100;
- Saldo físico = máximo(0, meta − execução acumulada);
- Não se somam unidades incompatíveis como m³, m², m, t e unidades.
- Itens com unidade contratual **VB** podem ter meta e unidade física configuradas pelo administrador.

O banco impede a aprovação de medições acima do volume executado. Quantidades são registradas com até duas casas decimais.

## Banco de dados e segurança

Migrações SQL versionadas:
- `supabase/migrations/20261116113000_obracontrol_shared_cloud_tables_v1.sql` — tabelas originais;
- `supabase/migrations/20261116205731_obracontrol_edit_entries_v2.sql` — correção segura e trilha de última edição.
- `supabase/migrations/20261116215204_obracontrol_bm_ledgers_and_private_docs.sql` — tabelas e bucket privados para BMs.
- `supabase/migrations/20261116220121_obracontrol_bm_approved_integrity_guards.sql` — travas de integridade de boletins aprovados.

Estrutura:
- `public.obc_items` — catálogo de serviços;
- `public.obc_configs` — metas físicas revisadas;
- `public.obc_entries` — produção e medição por data;
- `public.obc_photos` — referências das imagens;
- Bucket privado `obc-fotos` — fotografias reais armazenadas na nuvem.

As políticas RLS dependem de `public.profiles` do projeto AMBEV Pedidos RL. **Não execute a migração em outro banco sem adaptar a integração de usuários.**

O frontend utiliza somente a **chave pública** do Supabase. Não há chave de serviço ou credenciais privilegiadas no repositório. Fotos são exibidas com URLs temporárias autenticadas. Não envie arquivos internos diretamente para o GitHub.

## Limitações atuais

- Não foi possível fazer um teste ponta a ponta com uma senha real de colaborador, porque não acessamos as credenciais particulares dos usuários. Os testes transacionais de banco para produção e aprovação de medição passaram e foram revertidos.
- O site ainda precisa da ativação inicial do GitHub Pages pelo proprietário.
- **Importar backup local está desativado** na versão em nuvem para evitar sobrescrever dados compartilhados. Exportação CSV e backup JSON incluindo fotos permanecem disponíveis.
- Não houve migração automática dos registros do antigo protótipo que estejam salvos em dispositivos individuais. Para migrá-los será necessária uma importação controlada.
- O uso da infraestrutura AMBEV Pedidos RL compartilha a cota de armazenamento e Auth do mesmo projeto Supabase, apesar de as tabelas do ObraControl serem independentes.

## Repositório

| Arquivo | Finalidade |
| --- | --- |
| `index.html` | Aplicativo móvel e desktop, autenticação e sincronização |
| `rl-theme.css` e `rl-brand.js` | Identidade RL em todas as telas |
| `bm-module.js` e `bm-theme.css` | Controle de BMs, PDFs privados, recálculo por item e aprovação |
| `rdo-module.js` e `rdo-theme.css` | RDOs, revisão diária e exportação/arquivo de PDFs com fotos |
| `assets/rl-logo.svg` | Marca RL usada na interface |
| `itens.json` | Catálogo inicial de 70 serviços, sem preços |
| `supabase/migrations/*.sql` | Tabelas, validações, bucket de fotos e RLS |
| `.github/workflows/pages.yml` | Verifica os arquivos e publica no GitHub Pages |
| `manifest.webmanifest` e `icon.svg` | Atalho no celular |
| `sw.js` | Cache dos arquivos estáticos; **dados são sempre consultados na nuvem** |

## Verificação pós-publicação

1. Entre como administrador e registre **uma produção de teste** claramente identificada.
2. Entre como colaborador em outro celular e confirme que a produção aparece após atualização.
3. Anexe uma foto e verifique a galeria no outro dispositivo.
4. Confirme que a aprovação de medição só aparece para administradores.
5. Corrija a quantidade e confira o recálculo de progresso em outro dispositivo, sem perder as fotos.
6. Exclua o registro de teste como administrador.

Não utilize o sistema como referência oficial de execução antes de conferir as metas das planilhas com a versão contratual aprovada.

---

**ObraControl • Engenharia, produção e avanço físico, sem valores monetários.**
