/**
 * Localized copy for the standalone info / legal pages — Privacy, About, Terms,
 * Contact. English is the source of truth; other locales provide a Partial of
 * this shape and fall back to English field-by-field (see ../pages.ts).
 *
 * Translate ONLY human-facing prose. Keep object keys, `href` values, the
 * `updated` ISO date, and the brand name `OpsCanopy` byte-for-byte identical
 * (see src/i18n/GLOSSARY.md).
 */

import type { PagesContent } from './en';

const UPDATED = '2026-06-12';

const fr: Partial<PagesContent> = {
  ui: {
    updatedLabel: 'Dernière mise à jour',
  },

  privacy: {
    metaTitle: 'Politique de confidentialité',
    description:
      'Comment OpsCanopy traite vos données : chaque outil s’exécute entièrement dans votre navigateur. Rien de ce que vous collez n’est téléversé, journalisé ou partagé. Aucun compte, aucun suivi.',
    eyebrow: 'Confidentialité',
    heading: 'Vos données ne quittent jamais votre appareil.',
    lead: 'OpsCanopy est conçu pour la confidentialité avant tout. Chaque outil s’exécute entièrement dans votre navigateur — il n’y a aucun serveur pour recevoir vos données, aucun compte à créer et rien à téléverser. Cette politique explique précisément ce que cela signifie.',
    updated: UPDATED,
    sections: [
      {
        heading: 'En résumé',
        body: [
          'Le texte, les fichiers et la configuration que vous collez dans n’importe quel outil OpsCanopy sont traités localement, à l’intérieur de votre propre onglet de navigateur. Ils ne nous sont jamais envoyés ni transmis à un tiers, et ils ne sont jamais conservés après la fermeture de l’onglet.',
          'Nous ne gérons pas de comptes utilisateurs, nous n’exigeons aucune inscription et nous ne disposons d’aucune base de données de votre activité.',
        ],
      },
      {
        heading: 'Ce que nous traitons dans votre navigateur',
        body: [
          'Chaque outil est un petit programme qui s’exécute sous forme de JavaScript côté client (ou de WebAssembly). Lorsque vous collez une ligne de log, une règle d’alerte, une liste CIDR ou toute autre donnée, le calcul a lieu sur votre machine. Les résultats que vous voyez sont produits localement et disparaissent de la mémoire dès que vous quittez la page.',
          'Comme le travail est local, les outils continuent également de fonctionner hors ligne une fois la page chargée.',
        ],
      },
      {
        heading: 'Ce que nous ne collectons pas',
        body: [
          'Nous ne collectons pas le contenu de vos entrées ou de vos sorties. Nous n’utilisons pas de cookies publicitaires, de traceurs intersites ni d’empreinte numérique. Nous ne vendons, ne louons ni ne partageons aucune donnée personnelle, car nous ne la recueillons pas en premier lieu.',
          'Toute préférence que le site mémorise — comme votre thème clair/sombre ou votre langue — est stockée dans le stockage local de votre navigateur, sur votre appareil, et ne nous est jamais transmise.',
        ],
      },
      {
        heading: 'Hébergement et journaux serveur',
        body: [
          'OpsCanopy est servi sous forme de fichiers statiques par un hébergeur et un réseau de diffusion de contenu. Comme la quasi-totalité des hébergeurs web, ces fournisseurs peuvent conserver de courts journaux de requêtes standard (par exemple une adresse IP et l’user-agent du navigateur) afin de diffuser les pages, de limiter les abus et de maintenir la sécurité du service. Ces journaux sont opérationnels et ne servent pas à vous profiler.',
        ],
      },
      {
        heading: 'Services tiers',
        body: [
          'Nous limitons les dépendances externes au strict minimum. Le site peut charger des ressources telles que des polices web nécessaires au rendu des pages. Nous n’intégrons aucun réseau publicitaire ni pixel de suivi des réseaux sociaux.',
        ],
      },
      {
        heading: 'Modifications de cette politique',
        body: [
          'Si cette politique change, nous mettrons à jour la date affichée en haut de cette page. La poursuite de l’utilisation des outils après une mise à jour signifie que vous acceptez la politique révisée.',
        ],
      },
      {
        heading: 'Questions',
        body: [
          'Les questions relatives à la confidentialité sont les bienvenues. Le meilleur moyen de nous joindre est notre organisation GitHub publique — voir la page Contact pour le lien.',
        ],
      },
    ],
  },

  about: {
    metaTitle: 'À propos d’OpsCanopy',
    description:
      'OpsCanopy est une canopée grandissante d’outils gratuits, privés et basés sur le navigateur, destinés aux ingénieurs plateforme et DevOps — validateurs, convertisseurs, testeurs et linters qui ne touchent jamais un serveur.',
    eyebrow: 'À propos',
    heading: 'Des outils DevOps gratuits qui s’exécutent entièrement dans votre navigateur.',
    lead: 'OpsCanopy est une collection grandissante d’utilitaires ciblés pour les ingénieurs plateforme et DevOps. Chacun résout un petit problème concret — et chacun s’exécute à 100 % côté client, de sorte que ce que vous collez ne quitte jamais votre appareil.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Pourquoi il existe',
        body: [
          'Les ingénieurs recourent à des outils rapides des dizaines de fois par jour : valider un fichier de workflow, décoder un token, tester une regex sur des lignes de log, calculer un sous-réseau, convertir un fichier de suppression. Trop de ces outils vous demandent de coller des données internes sensibles dans un site web qui les téléverse discrètement vers un serveur.',
          'OpsCanopy adopte l’approche inverse. Les outils sont rapides, gratuits et privés par construction — rien de ce que vous collez n’est jamais transmis, car il n’y a nulle part où cela puisse aller.',
        ],
      },
      {
        heading: 'Comment ça fonctionne',
        body: [
          'L’ensemble du site est statique. Chaque outil est un programme autonome qui s’exécute dans votre navigateur à l’aide de JavaScript et, lorsque c’est utile, de WebAssembly. Il n’y a aucun backend, aucune API et aucun système de compte. Une fois une page chargée, la plupart des outils continuent de fonctionner même sans connexion réseau.',
        ],
      },
      {
        heading: 'Gratuit et ouvert',
        body: [
          'OpsCanopy est gratuit, sans inscription ni paywall. Les outils sont conçus selon de vraies spécifications et des vecteurs de test, afin que leurs résultats soient fiables, et le catalogue ne cesse de s’étoffer à mesure que de nouveaux utilitaires sont publiés.',
        ],
      },
      {
        heading: 'À qui il s’adresse',
        body: [
          'Il est conçu pour les ingénieurs plateforme, les SRE, les praticiens DevOps et toute personne qui vit au plus près de l’infrastructure — mais les outils sont utiles à tout développeur qui veut une réponse rapide et privée sans rien installer.',
        ],
      },
    ],
  },

  terms: {
    metaTitle: 'Conditions générales',
    description:
      'Les conditions en langage clair pour utiliser OpsCanopy — des outils DevOps gratuits, basés sur le navigateur, fournis en l’état, sans garantie ni responsabilité quant à l’usage que vous faites des résultats.',
    eyebrow: 'Conditions',
    heading: 'Conditions générales.',
    lead: 'Ces conditions régissent votre utilisation d’OpsCanopy et de ses outils. Elles sont rédigées en langage clair et sont volontairement courtes. En utilisant le site, vous les acceptez.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Acceptation de ces conditions',
        body: [
          'En accédant à OpsCanopy ou en l’utilisant, vous acceptez d’être lié par ces conditions. Si vous n’êtes pas d’accord, veuillez ne pas utiliser le site.',
        ],
      },
      {
        heading: 'Utilisation des outils',
        body: [
          'OpsCanopy fournit des utilitaires gratuits pour votre propre usage licite. Vous pouvez utiliser les outils à des fins personnelles et commerciales. Vous vous engagez à ne pas faire un usage abusif du site — par exemple en tentant de le perturber, de le surcharger ou de l’utiliser pour enfreindre la loi.',
          'Comme chaque outil s’exécute dans votre navigateur, vous êtes responsable des données que vous fournissez et de la vérification des résultats avant de vous y fier.',
        ],
      },
      {
        heading: 'Absence de garantie',
        body: [
          'Les outils sont fournis « en l’état » et « selon disponibilité », sans garantie d’aucune sorte, expresse ou implicite. Nous ne garantissons pas que les outils seront exacts, exempts d’erreurs, ininterrompus ou adaptés à un usage particulier. Vérifiez toujours les modifications critiques — y compris les résultats relatifs au réseau, à la sécurité, à la planification et à la configuration — par rapport à vos propres sources de référence avant de les appliquer.',
        ],
      },
      {
        heading: 'Limitation de responsabilité',
        body: [
          'Dans toute la mesure permise par la loi, OpsCanopy et ses contributeurs ne sauraient être tenus responsables de tout dommage direct, indirect, accessoire ou consécutif résultant de votre utilisation, ou de votre incapacité à utiliser, le site ou ses outils — y compris toute décision prise sur la base de leurs résultats.',
        ],
      },
      {
        heading: 'Marques déposées',
        body: [
          'Les noms de produits et de sociétés référencés par les outils — notamment Grafana, Loki, Prometheus, Kubernetes, GitHub Actions et d’autres — sont les marques déposées de leurs propriétaires respectifs. OpsCanopy n’est ni affilié à eux ni approuvé par eux. Loki et Grafana sont des marques déposées de Raintank, Inc.',
        ],
      },
      {
        heading: 'Modifications de ces conditions',
        body: [
          'Nous pouvons mettre à jour ces conditions de temps à autre. Lorsque nous le faisons, nous révisons la date en haut de cette page. La poursuite de votre utilisation du site après une modification signifie que vous acceptez les conditions mises à jour.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'Si vous avez des questions sur ces conditions, joignez-nous via les canaux indiqués sur la page Contact.',
        ],
      },
    ],
  },

  contact: {
    metaTitle: 'Contact',
    description:
      'Contactez OpsCanopy. Signalez un bug, demandez un outil ou posez une question via notre organisation GitHub publique.',
    eyebrow: 'Contact',
    heading: 'Contactez-nous.',
    lead: 'OpsCanopy est construit et maintenu de manière ouverte. Le moyen le plus rapide de signaler un bug, de demander une fonctionnalité ou de poser une question est notre organisation GitHub publique.',
    sections: [
      {
        heading: 'Bugs et demandes de fonctionnalités',
        body: [
          'Vous avez trouvé un dysfonctionnement, ou vous avez une idée d’outil que vous aimeriez voir exister ? Ouvrez une issue sur GitHub. Des rapports clairs et reproductibles — ce que vous avez collé, ce que vous attendiez et ce qui s’est passé — nous aident à corriger les choses rapidement.',
        ],
      },
      {
        heading: 'Questions générales',
        body: [
          'Pour tout le reste — y compris les questions de confidentialité ou les retours généraux — GitHub est le meilleur endroit pour nous joindre. Nous lisons tout, même si une réponse prend parfois un peu de temps.',
        ],
      },
    ],
    links: [
      { label: 'OpsCanopy sur GitHub', href: 'https://github.com/opscanopy', external: true },
      { label: '@opscanopy sur X', href: 'https://twitter.com/opscanopy', external: true },
    ],
  },
};

export default fr;
