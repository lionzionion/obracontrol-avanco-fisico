# RL Engenharia | ObraControl — acompanhamento físico de obras

Aplicativo web para **apontamento diário de serviços**, **volumes e percentuais**, **medições aprovadas** e **fotografias por item** da obra AMBEV Itapissuma. A interface **não exibe preços nem valores em reais**.


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
