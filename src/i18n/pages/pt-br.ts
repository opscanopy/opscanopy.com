import type { PagesContent } from './en';

const UPDATED = '2026-07-18';

const ptBr: Partial<PagesContent> = {
  ui: {
    updatedLabel: 'Última atualização',
    consent: {
      label: 'Permitir cookies de análise',
      on: 'Os cookies de análise estão ativados. Desmarque a caixa para voltar ao modo sem cookies.',
      off: 'Atualmente sem cookies — nenhum cookie de análise é definido sem o seu consentimento.',
    },
  },

  privacy: {
    metaTitle: 'Política de Privacidade',
    description:
      'Como o OpsCanopy lida com seus dados: cada ferramenta roda inteiramente no seu navegador. Nada do que você cola é enviado, registrado ou compartilhado. Sem contas, sem rastreamento.',
    eyebrow: 'Privacidade',
    heading: 'Seus dados nunca saem do seu dispositivo.',
    lead: 'O OpsCanopy foi construído com a privacidade em primeiro lugar. Cada ferramenta roda inteiramente no seu navegador — não há servidor para receber sua entrada, nenhuma conta a criar e nada a enviar. Esta política explica exatamente o que isso significa.',
    updated: UPDATED,
    sections: [
      {
        heading: 'A versão resumida',
        body: [
          'O texto, os arquivos e a configuração que você cola em qualquer ferramenta do OpsCanopy são processados localmente, dentro da sua própria aba do navegador. Eles nunca são enviados para nós nem para terceiros, e nunca são armazenados depois que você fecha a aba.',
          'Não temos contas de usuário, não exigimos cadastro e não mantemos nenhum banco de dados da sua atividade.',
        ],
      },
      {
        heading: 'O que processamos no seu navegador',
        body: [
          'Cada ferramenta é um pequeno programa que roda como JavaScript do lado do cliente (ou WebAssembly). Quando você cola uma linha de log, uma regra de alerta, uma lista CIDR ou qualquer outra entrada, o processamento acontece na sua máquina. Os resultados que você vê são produzidos localmente e desaparecem da memória quando você sai da página.',
          'Como o trabalho é local, as ferramentas também continuam funcionando offline depois que a página é carregada.',
        ],
      },
      {
        heading: 'O que não coletamos',
        body: [
          'Não coletamos o conteúdo das suas entradas nem das suas saídas. Não usamos cookies de publicidade, rastreadores entre sites ou fingerprinting. Não vendemos, alugamos nem compartilhamos dados pessoais, porque nem sequer os coletamos. Nossa única medição é a análise sem cookies por padrão descrita abaixo.',
          'Qualquer preferência que o site memoriza — como o tema claro/escuro ou o idioma — é armazenada no armazenamento local do seu navegador, no seu dispositivo, e nunca é transmitida para nós.',
        ],
      },
      {
        heading: 'O que o site armazena no seu dispositivo',
        body: [
          'Tudo o que o OpsCanopy memoriza fica no armazenamento local do seu navegador, no seu dispositivo, sob um punhado de chaves nomeadas que você pode inspecionar e excluir a qualquer momento. Nada disso é transmitido para nós. Hoje essas chaves são:',
          'theme — sua escolha de tema claro ou escuro.',
          'oc-analytics-consent — sua escolha de permitir cookies de análise, feita no controle desta página.',
          'oc-m90-v1 — seu progresso no Mission 90 Days DevOps: quais dias e missões você marcou como concluídos neste navegador.',
          'oc-m90-backup-meta — quando você fez o último backup desse progresso (e se você dispensou o lembrete de backup), para que o hub do Mission 90 saiba quando vale a pena mostrar um lembrete.',
          'opscanopy:tools:sort — como você ordenou o catálogo de ferramentas pela última vez.',
          'oc-roadmap-… (uma chave por roadmap de aprendizado) — quais tópicos você marcou como concluídos nesse roadmap.',
          'oc-guide-…-pos (uma chave por guia) — sua última posição de leitura nesse guia.',
          'oc-tools-v1 — as ferramentas que você fixou e as últimas que usou, para que as seções "Continue de onde parou" e "Suas ferramentas" possam exibi-las.',
          'oc-last-v1 — a última entrada que você digitou em uma ferramenta, restaurada automaticamente na próxima vez que você abrir essa mesma ferramenta. Nunca usado nas quatro ferramentas cuja entrada pode ser um segredo — Decodificador de JWT, Gerador de Hash, Codificador/Decodificador Base64 e o Verificador Env Example.',
          'oc-snap-v1 — instantâneos que você escolheu explicitamente guardar com o botão "Salvar instantâneo", para voltar a essa entrada exata depois. Disponível em todas as ferramentas, incluindo as quatro acima, já que salvar um é uma ação deliberada sua.',
          'oc-handoff-v1 — uma transferência única quando você segue um link como "Decodificar como JWT" entre duas ferramentas. Ela vive só nesta aba (sessionStorage, não localStorage) e é apagada assim que a ferramenta de destino a lê — nunca carregada na URL da página, então nunca fica no seu histórico de navegação.',
          'Limpar os dados do site no seu navegador remove tudo isso. O progresso do Mission 90 pode sobreviver a uma limpeza por meio do arquivo de backup ou do código do hub do Mission 90.',
        ],
      },
      {
        heading: 'Hospedagem e logs de servidor',
        body: [
          'O OpsCanopy é servido como arquivos estáticos a partir de um provedor de hospedagem e de uma rede de distribuição de conteúdo. Como praticamente todos os hosts da web, esses provedores podem manter logs de requisição padrão e de curta duração (por exemplo, um endereço IP e o user-agent do navegador) para entregar as páginas, mitigar abusos e manter o serviço seguro. Esses logs são operacionais e não são usados para criar um perfil seu.',
        ],
      },
      {
        heading: 'Análise de uso (analytics)',
        body: [
          'Usamos o Google Analytics 4 para entender quais ferramentas e guias são realmente úteis: visualizações de página e um punhado de eventos de produto anônimos (por exemplo, “um resultado foi copiado nesta página” ou “um dia do Mission 90 foi marcado como concluído”). Esses eventos carregam apenas o caminho da página — nunca incluem nada do que você digita ou cola em uma ferramenta.',
          'Por padrão, a análise roda em modo sem cookies (“consentimento negado”): nenhum cookie de análise é definido e nenhum identificador persistente é armazenado no seu dispositivo, a menos que você aceite explicitamente no controle abaixo. Você pode mudar sua escolha a qualquer momento nesta página, e o site funciona exatamente igual nos dois casos.',
        ],
      },
      {
        heading: 'Serviços de terceiros',
        body: [
          'Além do script de análise descrito acima, mantemos as dependências externas no mínimo — as fontes são hospedadas por nós mesmos e as páginas não carregam nenhum outro código de terceiros. Não incorporamos redes de publicidade nem pixels de rastreamento social.',
        ],
      },
      {
        heading: 'Alterações nesta política',
        body: [
          'Se esta política mudar, atualizaremos a data exibida no topo desta página. O uso contínuo das ferramentas após uma atualização significa que você aceita a política revisada.',
        ],
      },
      {
        heading: 'Dúvidas',
        body: [
          'Dúvidas sobre privacidade são bem-vindas. A melhor forma de falar conosco é pela nossa organização pública no GitHub — veja a página de Contato para o link.',
        ],
      },
    ],
  },

  about: {
    metaTitle: 'Sobre o OpsCanopy',
    description:
      'O OpsCanopy é uma copa crescente de ferramentas gratuitas, privadas e baseadas no navegador para engenheiros de plataforma e DevOps — validadores, conversores, testadores e linters que nunca tocam em um servidor.',
    eyebrow: 'Sobre',
    heading: 'Ferramentas de DevOps gratuitas que rodam inteiramente no seu navegador.',
    lead: 'O OpsCanopy é uma coleção crescente de utilitários focados para engenheiros de plataforma e DevOps. Cada um resolve um problema pequeno e real — e cada um roda 100% do lado do cliente, então as coisas que você cola nunca saem do seu dispositivo.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Por que ele existe',
        body: [
          'Engenheiros recorrem a ferramentas rápidas dezenas de vezes por dia: validar um arquivo de workflow, decodificar um token, testar uma regex contra linhas de log, calcular uma sub-rede, converter um arquivo de supressão. Ferramentas demais pedem que você cole dados internos sensíveis em um site que silenciosamente os envia para um servidor.',
          'O OpsCanopy adota a abordagem oposta. As ferramentas são rápidas, gratuitas e privadas por construção — nada do que você cola é transmitido, porque não há para onde ir.',
          'Isso inclui os assistentes de IA: uma caixa de chat também é um terceiro, e qualquer coisa que você cola nela fica retida nos servidores de um terceiro. Uma ferramenta que calcula localmente nunca coloca você nessa posição.',
        ],
      },
      {
        heading: 'Princípios',
        body: [
          'Somente local, por construção. Não há servidor que possa receber sua entrada — aqui, a privacidade é arquitetura, e não uma promessa de política.',
          'Determinístico, não plausível. As ferramentas calculam sua saída com parsers reais e aritmética exata, em vez de prever texto com aparência provável.',
          'Grátis para sempre, sem contas. Sem paywall, sem cadastro, sem captura de e-mail — abra uma ferramenta e use.',
          'Código aberto, para você poder auditar. O código completo é público no GitHub, e você pode ler exatamente o que cada ferramenta calcula.',
        ],
      },
      {
        heading: 'Como funciona',
        body: [
          'O site inteiro é estático. Cada ferramenta é um programa autocontido que roda no seu navegador usando JavaScript e, onde ajuda, WebAssembly. Não há backend, nem API, nem sistema de contas. Depois que uma página é carregada, a maioria das ferramentas continua funcionando mesmo sem rede.',
        ],
      },
      {
        heading: 'Como ele é construído e testado',
        body: [
          'Os motores são TypeScript puro. Onde a correção tem uma autoridade a quem responder, os testes estão fixados nela — o comportamento de sub-rede /31 da RFC 3021, os vetores de teste de hash do NIST e um corpus de conformidade versionado para o testador de expressões do GitHub Actions.',
          'Os motores recebem texto e devolvem resultados — sem chamadas de rede, sem nada escondido —, então o comportamento que uma ferramenta afirma ter é reproduzível em um teste.',
        ],
      },
      {
        heading: 'Para quem é',
        body: [
          'É feito para engenheiros de plataforma, SREs, profissionais de DevOps e qualquer pessoa que vive perto da infraestrutura — mas as ferramentas são úteis para qualquer desenvolvedor que queira uma resposta rápida e privada sem instalar nada.',
        ],
      },
      {
        heading: 'Quem constrói o OpsCanopy',
        body: [
          'O OpsCanopy é construído e mantido por Pushkar Kumar e Asif Khan — engenheiros que se cansaram de colar configurações sensíveis em ferramentas web aleatórias e decidiram construir alternativas rápidas, privadas e do lado do cliente.',
          'Pushkar Kumar — [PLACEHOLDER: real background in his own words; this page must not deploy until this is filled in].',
          'Asif Khan — [PLACEHOLDER: real background in his own words; this page must not deploy until this is filled in].',
          'O desenvolvimento acontece de forma aberta no GitHub, então você pode auditar exatamente como cada ferramenta se comporta, relatar um bug ou sugerir o próximo utilitário a ser adicionado.',
        ],
      },
    ],
    links: [
      { label: 'OpsCanopy no GitHub', href: 'https://github.com/opscanopy/opscanopy.com', external: true },
      { label: 'Relatar um problema', href: 'https://github.com/opscanopy/opscanopy.com/issues', external: true },
    ],
  },

  terms: {
    metaTitle: 'Termos e Condições',
    description:
      'Os termos em linguagem simples para usar o OpsCanopy — ferramentas de DevOps gratuitas e baseadas no navegador, fornecidas no estado em que se encontram, sem garantia e sem responsabilidade por como você usa a saída.',
    eyebrow: 'Termos',
    heading: 'Termos e Condições.',
    lead: 'Estes termos regem o seu uso do OpsCanopy e de suas ferramentas. Eles são escritos em linguagem simples e são intencionalmente curtos. Ao usar o site, você concorda com eles.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Aceitação destes termos',
        body: [
          'Ao acessar ou usar o OpsCanopy, você concorda em ficar vinculado a estes termos. Se você não concordar, por favor não use o site.',
        ],
      },
      {
        heading: 'Uso das ferramentas',
        body: [
          'O OpsCanopy fornece utilitários gratuitos para o seu próprio uso lícito. Você pode usar as ferramentas para trabalho pessoal e comercial. Você concorda em não usar o site de forma indevida — por exemplo, tentando interrompê-lo, sobrecarregá-lo ou usá-lo para infringir a lei.',
          'Como cada ferramenta roda no seu navegador, você é responsável pela entrada que fornece e por revisar a saída antes de confiar nela.',
        ],
      },
      {
        heading: 'Sem garantia',
        body: [
          'As ferramentas são fornecidas “no estado em que se encontram” e “conforme disponíveis”, sem garantias de qualquer tipo, sejam expressas ou implícitas. Não garantimos que as ferramentas serão precisas, livres de erros, ininterruptas ou adequadas a qualquer finalidade específica. Sempre verifique alterações críticas — incluindo saídas de rede, segurança, agendamento e configuração — em relação às suas próprias fontes autoritativas antes de aplicá-las.',
        ],
      },
      {
        heading: 'Limitação de responsabilidade',
        body: [
          'Na máxima extensão permitida por lei, o OpsCanopy e seus contribuidores não são responsáveis por quaisquer danos diretos, indiretos, incidentais ou consequenciais decorrentes do seu uso, ou da incapacidade de usar, o site ou suas ferramentas — incluindo quaisquer decisões tomadas com base na sua saída.',
        ],
      },
      {
        heading: 'Marcas registradas',
        body: [
          'Os nomes de produtos e empresas referenciados pelas ferramentas — incluindo Grafana, Loki, Prometheus, Kubernetes, GitHub Actions e outros — são marcas registradas de seus respectivos proprietários. O OpsCanopy não é afiliado a eles nem endossado por eles. Loki e Grafana são marcas registradas da Raintank, Inc.',
        ],
      },
      {
        heading: 'Alterações nestes termos',
        body: [
          'Podemos atualizar estes termos de tempos em tempos. Quando o fizermos, revisaremos a data no topo desta página. O seu uso contínuo do site após uma alteração significa que você aceita os termos atualizados.',
        ],
      },
      {
        heading: 'Contato',
        body: [
          'Se você tiver dúvidas sobre estes termos, fale conosco pelos canais listados na página de Contato.',
        ],
      },
    ],
  },

  contact: {
    metaTitle: 'Contato',
    description:
      'Entre em contato com o OpsCanopy. Relate um bug, solicite uma ferramenta ou faça uma pergunta pela nossa organização pública no GitHub.',
    eyebrow: 'Contato',
    heading: 'Entre em contato.',
    lead: 'O OpsCanopy é construído e mantido de forma aberta. A maneira mais rápida de relatar um bug, solicitar um recurso ou fazer uma pergunta é pela nossa organização pública no GitHub.',
    sections: [
      {
        heading: 'Bugs e solicitações de recursos',
        body: [
          'Encontrou algo quebrado ou tem uma ideia para uma ferramenta que gostaria que existisse? Abra uma issue no GitHub. Relatos claros e reproduzíveis — o que você colou, o que esperava e o que aconteceu — ajudam a corrigir as coisas rapidamente.',
        ],
      },
      {
        heading: 'Perguntas gerais',
        body: [
          'Para qualquer outra coisa — incluindo dúvidas sobre privacidade ou feedback geral — o GitHub é o melhor lugar para falar conosco. Lemos tudo, mesmo que a resposta demore um pouco.',
        ],
      },
    ],
    links: [
      { label: 'E-mail para hello@opscanopy.com', href: 'mailto:hello@opscanopy.com' },
      {
        label: 'Relatar um problema',
        href: 'https://github.com/opscanopy/opscanopy.com/issues/new',
        external: true,
      },
      { label: 'OpsCanopy no GitHub', href: 'https://github.com/opscanopy', external: true },
      { label: '@opscanopy no X', href: 'https://twitter.com/opscanopy', external: true },
    ],
  },
};

export default ptBr;
