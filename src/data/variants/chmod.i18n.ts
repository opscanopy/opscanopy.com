/**
 * Localized chmod variant pages (/de/chmod-calculator/777/ …). Keyed by slug,
 * then locale; each entry is a whole translated ToolVariant with the same slug
 * and input as its English twin in ./chmod.ts. Only the modes listed here get a
 * locale page, so hreflang must list only these (see `localesFor`).
 *
 * As in chmod.ts, every mechanical fact (symbolic string, ls -l column,
 * command, which class gets which bits) comes from the engine at module scope.
 * Gated by ./variants.test.ts.
 */
import { parseOctal } from '../../lib/chmod-calculator/engine';
import { chmodVariants } from './chmod';
import type { Perm } from '../../lib/chmod-calculator/types';
import type { Locale } from '../../i18n/config';
import type { ToolVariant } from './index';

export type VariantLocale = Exclude<Locale, 'en'>;

/** Per-locale words for the digit breakdown. */
const WORDS: Record<VariantLocale, { r: string; w: string; x: string; and: string; none: string; only: (b: string) => string }> = {
  de: { r: 'Lesen', w: 'Schreiben', x: 'Ausführen', and: 'und', none: 'kein Zugriff', only: (b) => `nur ${b}` },
  es: { r: 'lectura', w: 'escritura', x: 'ejecución', and: 'y', none: 'ningún acceso', only: (b) => `solo ${b}` },
  fr: { r: 'lecture', w: 'écriture', x: 'exécution', and: 'et', none: 'aucun accès', only: (b) => `${b} seule` },
  'pt-br': { r: 'leitura', w: 'escrita', x: 'execução', and: 'e', none: 'nenhum acesso', only: (b) => `somente ${b}` },
};

function grants(p: Perm, l: VariantLocale): string {
  const t = WORDS[l];
  const bits = [p.read && t.r, p.write && t.w, p.execute && t.x].filter(Boolean) as string[];
  if (bits.length === 0) return t.none;
  if (bits.length === 1) return t.only(bits[0]);
  return `${bits.slice(0, -1).join(', ')} ${t.and} ${bits[bits.length - 1]}`;
}

interface Facts {
  symbolic: string;
  ls: string;
  cmd: string;
  /** The engine-derived digit breakdown sentence, in the locale. */
  digits: string;
}

const LEAD: Record<VariantLocale, (o: string) => string> = {
  de: (o) => `In \`${o}\` steht die erste Ziffer für den Eigentümer, die zweite für die Gruppe und die dritte für alle anderen.`,
  es: (o) => `En \`${o}\` el primer dígito corresponde al propietario, el segundo al grupo y el tercero a todos los demás.`,
  fr: (o) => `Dans \`${o}\`, le premier chiffre désigne le propriétaire, le deuxième le groupe et le troisième tous les autres.`,
  'pt-br': (o) => `Em \`${o}\` o primeiro dígito é o dono, o segundo o grupo e o terceiro todos os outros.`,
};
const CLASSES: Record<VariantLocale, [string, string, string]> = {
  de: ['Eigentümer', 'Gruppe', 'andere'],
  es: ['propietario', 'grupo', 'otros'],
  fr: ['propriétaire', 'groupe', 'autres'],
  'pt-br': ['dono', 'grupo', 'outros'],
};

function facts(octal: string, l: VariantLocale): Facts {
  const r = parseOctal(octal);
  if (!r.valid || !r.state || !r.symbolic || !r.lsStyle || !r.command) {
    throw new Error(`chmod i18n variant ${octal}: engine rejected it (${r.error ?? 'no result'})`);
  }
  const [o, g, a] = CLASSES[l];
  const sep = l === 'fr' ? ' : ' : ': ';
  const list = [
    `${o}${sep}${grants(r.state.user, l)}`,
    `${g}${sep}${grants(r.state.group, l)}`,
    `${a}${sep}${grants(r.state.other, l)}`,
  ].join(l === 'fr' ? ' ; ' : '; ');
  const digits = `${LEAD[l](octal)} ${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
  return { symbolic: r.symbolic, ls: r.lsStyle, cmd: r.command, digits };
}

const de777 = facts('777', 'de');
const de755 = facts('755', 'de');
const de600 = facts('600', 'de');
const de700 = facts('700', 'de');
const es777 = facts('777', 'es');
const fr777 = facts('777', 'fr');
const fr755 = facts('755', 'fr');
const fr600 = facts('600', 'fr');
const fr700 = facts('700', 'fr');
const br777 = facts('777', 'pt-br');
const br755 = facts('755', 'pt-br');
const br600 = facts('600', 'pt-br');
const br700 = facts('700', 'pt-br');

export const chmodI18n: Record<string, Partial<Record<VariantLocale, ToolVariant>>> = {
  '777': {
    de: {
      slug: '777',
      input: '777',
      h1Name: 'chmod 777',
      headline: 'was der Modus bedeutet und wann er angebracht ist',
      title: 'chmod 777 Bedeutung — Linux-Rechte einfach erklärt',
      description:
        'chmod 777 gibt Eigentümer, Gruppe und allen anderen Lesen, Schreiben und Ausführen (rwxrwxrwx). Was die Ziffern bedeuten und was besser passt.',
      lede: `\`${de777.cmd}\` setzt den Modus \`${de777.symbolic}\`: Jedes Konto auf dem System darf die Datei lesen, ändern und ausführen. Das ist fast nie die richtige Lösung — meist sind 755 oder 644 der sicherere Wert.`,
      sections: [
        {
          heading: 'Was chmod 777 bedeutet',
          paragraphs: [
            de777.digits,
            `\`ls -l\` zeigt den Modus als \`${de777.ls}\`. Jede 7 ist 4 + 2 + 1, also Lesen plus Schreiben plus Ausführen — keine Klasse bleibt außen vor. Auf einem Verzeichnis bedeuten dieselben Bits, dass jedes Konto es auflisten, betreten und darin Einträge anlegen, umbenennen oder löschen darf, auch Dateien, die jemand anderem gehören.`,
          ],
        },
        {
          heading: 'Warum 777 ein Sicherheitsproblem ist',
          paragraphs: [
            `Eine weltweit beschreibbare Datei kann jeder lokale Prozess ersetzen, auch ein kompromittierter Webserver, der als \`www-data\` oder \`nginx\` läuft. Ist die Datei ein Skript, das cron oder ein Deploy-Hook startet, kann jeder, der sie beschreiben darf, Code unter dem Konto ausführen, das sie aufruft. Ein weltweit beschreibbares Verzeichnis erlaubt es jedem Benutzer, Dateien in einem Pfad abzulegen, dem ein anderes Programm vertraut.`,
            `Gemeinsamer Arbeitsplatz wie \`/tmp\` ist absichtlich für alle beschreibbar, hat aber den Modus 1777 und nicht 777: Das zusätzliche Sticky-Bit sorgt dafür, dass jeder nur seine eigenen Dateien löschen kann. Ein schlichtes 777-Verzeichnis bietet diesen Schutz nicht.`,
          ],
        },
        {
          heading: 'Wann man zu 777 greift — und was stattdessen hilft',
          paragraphs: [
            `777 taucht meist nach einem „Permission denied“ einer Web-App oder eines Container-Volumes auf. Die eigentliche Ursache ist fast immer der Besitz: Der Prozess läuft unter einem anderen Benutzer als dem, dem die Dateien gehören. Beheben Sie das mit \`chown\` auf das Dienstkonto oder indem Sie dieses Konto in die Gruppe der Datei aufnehmen und der Gruppe Schreibrecht geben, statt die Datei für alle zu öffnen.`,
            `Für Code und Verzeichnisse, die ein Server nur lesen muss, ist 755 für Verzeichnisse und 644 für Dateien das übliche Paar. Ein rekursives \`chmod -R 777\` macht außerdem jede Datei ausführbar; reparieren Sie das getrennt nach Typ mit \`find dir -type d -exec chmod 755 {} +\` und \`find dir -type f -exec chmod 644 {} +\`.`,
          ],
        },
      ],
      faqs: [
        {
          q: 'Ist chmod 777 jemals in Ordnung?',
          a: 'Selten, und nur auf einem Wegwerf-Rechner mit einem einzigen Benutzer. Für gemeinsamen Arbeitsplatz nehmen Sie 1777, damit das Sticky-Bit verhindert, dass Benutzer fremde Dateien löschen. Auf einem Server oder in einem Container-Image korrigieren Sie besser den Besitz.',
        },
        {
          q: 'Macht chmod 777 eine Datei für alle ausführbar?',
          a: 'Ja. Alle drei Klassen erhalten das Ausführ-Bit, also kann jeder Benutzer die Datei als Programm starten, sofern sie ein gültiges Binary oder ein Skript mit Shebang-Zeile ist. Ein Grund mehr, den Modus nicht auf einen ganzen Verzeichnisbaum anzuwenden.',
        },
      ],
    },
    es: {
      slug: '777',
      input: '777',
      h1Name: 'chmod 777',
      headline: 'qué significa y cuándo usarlo',
      title: 'chmod 777: qué significa — permisos Linux explicados',
      description:
        'chmod 777 da lectura, escritura y ejecución al propietario, al grupo y a todos los demás (rwxrwxrwx). Qué concede cada dígito y qué usar en su lugar.',
      lede: `\`${es777.cmd}\` fija el modo \`${es777.symbolic}\`: cualquier usuario del sistema puede leer, modificar y ejecutar el archivo. Casi nunca es la solución correcta; lo más seguro suele ser 755 o 644.`,
      sections: [
        {
          heading: 'Qué significa chmod 777',
          paragraphs: [
            es777.digits,
            `\`ls -l\` lo muestra como \`${es777.ls}\`. Cada 7 es 4 + 2 + 1 — lectura más escritura más ejecución — así que ninguna clase queda fuera. En un directorio, los mismos bits permiten a cualquier cuenta listarlo, entrar en él y crear, renombrar o borrar entradas dentro, incluidos archivos que pertenecen a otra persona.`,
          ],
        },
        {
          heading: 'Por qué 777 es un problema de seguridad',
          paragraphs: [
            `Un archivo con escritura para todos puede sustituirlo cualquier proceso local, incluido un servidor web comprometido que corre como \`www-data\` o \`nginx\`. Si ese archivo es un script que lanza cron o un hook de despliegue, quien pueda escribirlo puede ejecutar código con la cuenta que lo invoca. Un directorio con escritura para todos deja que cualquier usuario deposite archivos en una ruta en la que confía otro programa.`,
            `Los espacios compartidos como \`/tmp\` tienen escritura para todos a propósito, pero con el modo 1777, no 777: el bit sticky adicional hace que cada usuario solo pueda borrar sus propios archivos. Un directorio 777 a secas no tiene esa protección.`,
          ],
        },
        {
          heading: 'Cuándo se recurre a él y qué hacer en su lugar',
          paragraphs: [
            `777 suele aparecer tras un "permission denied" de una aplicación web o de un volumen de contenedor. La causa real casi siempre es la propiedad: el proceso corre con un usuario distinto del dueño de los archivos. Corrígelo con \`chown\` hacia la cuenta del servicio, o metiendo esa cuenta en el grupo del archivo y dando escritura al grupo, en vez de abrir el archivo a todo el mundo.`,
            `Para código y directorios que un servidor solo necesita leer, la pareja habitual es 755 para directorios y 644 para archivos. Un \`chmod -R 777\` recursivo además vuelve ejecutable cada archivo; repáralo por tipo con \`find dir -type d -exec chmod 755 {} +\` y \`find dir -type f -exec chmod 644 {} +\`.`,
          ],
        },
      ],
      faqs: [
        {
          q: '¿Es aceptable chmod 777 alguna vez?',
          a: 'Rara vez, y solo en una máquina desechable de un único usuario. Para un espacio compartido usa 1777, así el bit sticky impide que los usuarios borren archivos ajenos. En un servidor o en una imagen de contenedor, corrige la propiedad.',
        },
        {
          q: '¿chmod 777 hace que un archivo sea ejecutable para todos?',
          a: 'Sí. Las tres clases reciben el bit de ejecución, así que cualquier usuario puede lanzarlo como programa si es un binario válido o un script con línea shebang. Es un motivo más para no aplicarlo a un árbol entero.',
        },
      ],
    },
    fr: {
      slug: '777',
      input: '777',
      h1Name: 'chmod 777',
      headline: 'ce que ce mode signifie et quand l’utiliser',
      title: 'chmod 777 : signification — droits Linux expliqués',
      description:
        'chmod 777 donne lecture, écriture et exécution au propriétaire, au groupe et à tous les autres (rwxrwxrwx). Ce que vaut chaque chiffre et quoi choisir.',
      lede: `\`${fr777.cmd}\` applique le mode \`${fr777.symbolic}\` : tout utilisateur du système peut lire, modifier et exécuter le fichier. Ce n’est presque jamais la bonne solution ; la valeur plus sûre est en général 755 ou 644.`,
      sections: [
        {
          heading: 'Ce que signifie chmod 777',
          paragraphs: [
            fr777.digits,
            `\`ls -l\` l’affiche sous la forme \`${fr777.ls}\`. Chaque 7 vaut 4 + 2 + 1 — lecture plus écriture plus exécution — donc aucune classe n’est exclue. Sur un répertoire, les mêmes bits permettent à n’importe quel compte de le lister, d’y entrer et d’y créer, renommer ou supprimer des entrées, y compris des fichiers qui appartiennent à quelqu’un d’autre.`,
          ],
        },
        {
          heading: 'Pourquoi 777 pose un problème de sécurité',
          paragraphs: [
            `Un fichier modifiable par tous peut être remplacé par n’importe quel processus local, y compris un serveur web compromis qui tourne sous \`www-data\` ou \`nginx\`. Si ce fichier est un script lancé par cron ou par un hook de déploiement, quiconque peut l’écrire peut exécuter du code sous le compte qui l’appelle. Un répertoire modifiable par tous permet à chaque utilisateur de déposer des fichiers dans un chemin auquel un autre programme fait confiance.`,
            `Un espace partagé comme \`/tmp\` est modifiable par tous à dessein, mais en mode 1777 et non 777 : le sticky bit supplémentaire fait que chacun ne peut supprimer que ses propres fichiers. Un répertoire en 777 simple n’offre pas cette protection.`,
          ],
        },
        {
          heading: 'Quand on y recourt, et que faire à la place',
          paragraphs: [
            `777 apparaît le plus souvent après un « Permission denied » d’une application web ou d’un volume de conteneur. La vraie cause est presque toujours la propriété : le processus tourne sous un autre utilisateur que le propriétaire des fichiers. Corrigez-la avec \`chown\` vers le compte de service, ou en ajoutant ce compte au groupe du fichier et en donnant l’écriture au groupe, plutôt qu’en ouvrant le fichier à tous.`,
            `Pour du code et des répertoires qu’un serveur doit seulement lire, le couple habituel est 755 pour les répertoires et 644 pour les fichiers. Un \`chmod -R 777\` récursif rend en plus chaque fichier exécutable ; réparez par type avec \`find dir -type d -exec chmod 755 {} +\` puis \`find dir -type f -exec chmod 644 {} +\`.`,
          ],
        },
      ],
      faqs: [
        {
          q: 'chmod 777 est-il parfois acceptable ?',
          a: 'Rarement, et seulement sur une machine jetable à utilisateur unique. Pour un espace partagé, utilisez 1777 afin que le sticky bit empêche les utilisateurs de supprimer les fichiers des autres. Sur un serveur ou dans une image de conteneur, corrigez plutôt la propriété.',
        },
        {
          q: 'chmod 777 rend-il un fichier exécutable par tout le monde ?',
          a: 'Oui. Les trois classes reçoivent le bit d’exécution, donc n’importe quel utilisateur peut lancer le fichier comme programme s’il s’agit d’un binaire valide ou d’un script avec une ligne shebang. Une raison de plus de ne pas l’appliquer à toute une arborescence.',
        },
      ],
    },
    'pt-br': {
      slug: '777',
      input: '777',
      h1Name: 'chmod 777',
      headline: 'o que significa e quando usar',
      title: 'chmod 777: o que significa — permissões Linux',
      description:
        'chmod 777 dá leitura, escrita e execução ao dono, ao grupo e a todos os outros (rwxrwxrwx). O que cada dígito concede e o que usar no lugar.',
      lede: `\`${br777.cmd}\` define o modo \`${br777.symbolic}\`: qualquer usuário do sistema pode ler, modificar e executar o arquivo. Quase nunca é a correção certa; o valor mais seguro costuma ser 755 ou 644.`,
      sections: [
        {
          heading: 'O que chmod 777 significa',
          paragraphs: [
            br777.digits,
            `O \`ls -l\` mostra o modo como \`${br777.ls}\`. Cada 7 é 4 + 2 + 1 — leitura mais escrita mais execução — então nenhuma classe fica de fora. Em um diretório, os mesmos bits permitem que qualquer conta o liste, entre nele e crie, renomeie ou apague entradas lá dentro, inclusive arquivos que pertencem a outra pessoa.`,
          ],
        },
        {
          heading: 'Por que 777 é um problema de segurança',
          paragraphs: [
            `Um arquivo gravável por todos pode ser substituído por qualquer processo local, incluindo um servidor web comprometido rodando como \`www-data\` ou \`nginx\`. Se esse arquivo for um script executado pelo cron ou por um hook de deploy, quem consegue gravá-lo consegue rodar código com a conta que o executa. Um diretório gravável por todos deixa qualquer usuário colocar arquivos em um caminho no qual outro programa confia.`,
            `Áreas compartilhadas como \`/tmp\` são graváveis por todos de propósito, mas com o modo 1777, não 777: o sticky bit extra faz com que cada usuário só possa apagar os próprios arquivos. Um diretório 777 puro não tem essa proteção.`,
          ],
        },
        {
          heading: 'Quando as pessoas recorrem a ele e o que fazer em vez disso',
          paragraphs: [
            `O 777 costuma aparecer depois de um "permission denied" de uma aplicação web ou de um volume de contêiner. A causa real quase sempre é a propriedade: o processo roda com um usuário diferente do dono dos arquivos. Corrija com \`chown\` para a conta do serviço, ou colocando essa conta no grupo do arquivo e dando escrita ao grupo, em vez de abrir o arquivo para todo mundo.`,
            `Para código e diretórios que um servidor só precisa ler, a dupla convencional é 755 para diretórios e 644 para arquivos. Um \`chmod -R 777\` recursivo também torna todo arquivo executável; conserte por tipo com \`find dir -type d -exec chmod 755 {} +\` e \`find dir -type f -exec chmod 644 {} +\`.`,
          ],
        },
      ],
      faqs: [
        {
          q: 'chmod 777 é aceitável em algum caso?',
          a: 'Raramente, e só em uma máquina descartável de um único usuário. Para uma área compartilhada use 1777, assim o sticky bit impede que usuários apaguem arquivos alheios. Em um servidor ou em uma imagem de contêiner, corrija a propriedade.',
        },
        {
          q: 'chmod 777 torna um arquivo executável para todos?',
          a: 'Sim. As três classes recebem o bit de execução, então qualquer usuário pode rodar o arquivo como programa se ele for um binário válido ou um script com linha shebang. É mais um motivo para não aplicá-lo a uma árvore inteira.',
        },
      ],
    },
  },
  '755': {
    de: {
      slug: '755',
      input: '755',
      h1Name: 'chmod 755',
      headline: 'der Standardmodus für Verzeichnisse und Programme',
      title: 'chmod 755 Bedeutung — rwxr-xr-x erklärt',
      description:
        'chmod 755 (rwxr-xr-x): Der Eigentümer darf schreiben, alle dürfen lesen und ausführen. Warum das der Standard für Verzeichnisse, Skripte und Programme ist.',
      lede: `\`${de755.cmd}\` setzt \`${de755.symbolic}\`: Nur der Eigentümer darf die Datei ändern, alle anderen dürfen sie lesen und ausführen. Das ist der übliche Modus für Verzeichnisse, installierte Programme und Shell-Skripte.`,
      sections: [
        {
          heading: 'Was chmod 755 bedeutet',
          paragraphs: [
            de755.digits,
            `In \`ls -l\` erscheint der Modus als \`${de755.ls}\`. Die 7 ist 4 + 2 + 1, jede 5 ist 4 + 1, also Lesen plus Ausführen. Auf einem Verzeichnis erlaubt Lesen das Auflisten der Namen und Ausführen das Durchqueren, um Dateien per Pfad zu öffnen. 755 ist damit ein Verzeichnis, das alle durchsuchen können, in dem aber nur der Eigentümer etwas anlegen oder entfernen darf.`,
          ],
        },
        {
          heading: 'Wo 755 die richtige Wahl ist',
          paragraphs: [
            `Der Großteil von \`/usr/bin\` hat 755 und gehört root: Jeder Benutzer kann \`ls\` oder \`git\` starten, aber nur root kann sie ersetzen. Dasselbe gilt für eigene Skripte in \`~/bin\` und für Web-Dokumentwurzeln, in die der Server jedes Verzeichnis betreten, die er aber nicht umschreiben können soll.`,
            `755 ist auch das, was \`mkdir\` bei der verbreiteten umask 022 erzeugt: Neue Verzeichnisse starten bei 777, und die umask entfernt das Schreibrecht für Gruppe und andere.`,
          ],
        },
        {
          heading: 'Stolperfallen',
          paragraphs: [
            `Auf einer reinen Datendatei ist 755 harmlos, aber irreführend: Eine Konfigurationsdatei oder ein Bild wird als ausführbar markiert. Für Dateien, die nur gelesen werden, ist 644 richtig. Außerdem ist 755 für jedes Konto auf dem Host lesbar — für Geheimnisse ist es der falsche Modus, ein Verzeichnis mit Zugangsdaten braucht 700 oder 750.`,
            `Wenden Sie den Modus nicht mit \`chmod -R 755\` auf einen gemischten Baum an, sonst wird jede Datei ausführbar. Nutzen Sie \`find dir -type d -exec chmod 755 {} +\` für Verzeichnisse oder die symbolische Form \`chmod -R u=rwX,go=rX dir\`, bei der das große X Ausführen nur Verzeichnissen und bereits ausführbaren Dateien gibt.`,
          ],
        },
      ],
      faqs: [
        {
          q: 'Was ist der Unterschied zwischen 755 und 775?',
          a: 'Die mittlere Ziffer. 755 gibt der Gruppe nur Lesen und Ausführen; 775 gibt ihr zusätzlich Schreiben, sodass jedes Gruppenmitglied die Datei ändern oder in einem Verzeichnis Einträge anlegen und löschen kann. 775 passt zu gemeinsamen Projektverzeichnissen mit eigener Gruppe.',
        },
        {
          q: 'Sollen Web-Dateien 755 oder 644 haben?',
          a: 'Verzeichnisse 755, Dateien 644. Der Webserver braucht Ausführen auf Verzeichnissen, um sie zu durchqueren, aber eine statische HTML-, CSS- oder PHP-Datei muss nur lesbar sein. PHP-Dateien liest der Interpreter, der Kernel führt sie nicht aus.',
        },
      ],
    },
    fr: {
      slug: '755',
      input: '755',
      h1Name: 'chmod 755',
      headline: 'le mode standard des répertoires et des exécutables',
      title: 'chmod 755 : signification — rwxr-xr-x expliqué',
      description:
        'chmod 755 (rwxr-xr-x) : le propriétaire peut écrire, tout le monde peut lire et exécuter. Pourquoi c’est le défaut des répertoires, scripts et binaires.',
      lede: `\`${fr755.cmd}\` applique \`${fr755.symbolic}\` : seul le propriétaire peut modifier le fichier, tandis que tout le monde peut le lire et l’exécuter. C’est le mode habituel des répertoires, des binaires installés et des scripts shell.`,
      sections: [
        {
          heading: 'Ce que signifie chmod 755',
          paragraphs: [
            fr755.digits,
            `Dans \`ls -l\`, il apparaît sous la forme \`${fr755.ls}\`. Le 7 vaut 4 + 2 + 1 et chaque 5 vaut 4 + 1, lecture plus exécution. Sur un répertoire, la lecture permet de lister les noms et l’exécution de le traverser pour ouvrir des fichiers par leur chemin : 755 est donc un répertoire que tout le monde peut parcourir, mais où seul le propriétaire peut ajouter ou supprimer.`,
          ],
        },
        {
          heading: 'Quand 755 est le bon choix',
          paragraphs: [
            `La plupart de \`/usr/bin\` est en 755 et appartient à root : chaque utilisateur peut lancer \`ls\` ou \`git\`, personne d’autre que root ne peut les remplacer. Il en va de même pour vos scripts dans \`~/bin\` et pour les racines de sites web, où le serveur doit entrer dans chaque répertoire sans pouvoir réécrire le site.`,
            `C’est aussi ce que produit \`mkdir\` avec l’umask courante 022 : les nouveaux répertoires partent de 777 et l’umask retire l’écriture au groupe et aux autres.`,
          ],
        },
        {
          heading: 'Pièges',
          paragraphs: [
            `Sur un simple fichier de données, 755 est inoffensif mais trompeur : il marque un fichier de configuration ou une image comme exécutable. Utilisez 644 pour les fichiers qui sont seulement lus. Et 755 est lisible par tous les comptes de la machine, ce qui en fait le mauvais mode pour un secret : un répertoire d’identifiants demande 700 ou 750.`,
            `Ne l’appliquez pas avec \`chmod -R 755\` sur une arborescence mixte, sinon chaque fichier devient exécutable. Utilisez \`find dir -type d -exec chmod 755 {} +\` pour les répertoires, ou la forme symbolique \`chmod -R u=rwX,go=rX dir\`, où le X majuscule n’ajoute l’exécution qu’aux répertoires et aux fichiers déjà exécutables.`,
          ],
        },
      ],
      faqs: [
        {
          q: 'Quelle différence entre 755 et 775 ?',
          a: 'Le chiffre du milieu. 755 donne au groupe la lecture et l’exécution seulement ; 775 lui donne aussi l’écriture, si bien que tout membre du groupe peut modifier le fichier ou, sur un répertoire, créer et supprimer des entrées. Réservez 775 aux répertoires de projet partagés avec un groupe dédié.',
        },
        {
          q: 'Les fichiers web doivent-ils être en 755 ou en 644 ?',
          a: 'Les répertoires en 755, les fichiers en 644. Le serveur web a besoin de l’exécution sur les répertoires pour les traverser, mais un fichier HTML, CSS ou PHP statique doit seulement être lisible. Les fichiers PHP sont lus par l’interpréteur, pas exécutés par le noyau.',
        },
      ],
    },
    'pt-br': {
      slug: '755',
      input: '755',
      h1Name: 'chmod 755',
      headline: 'o modo padrão para diretórios e executáveis',
      title: 'chmod 755: o que significa — rwxr-xr-x explicado',
      description:
        'chmod 755 (rwxr-xr-x): o dono pode escrever, todos podem ler e executar. Por que é o padrão para diretórios, scripts e binários, e como aplicá-lo.',
      lede: `\`${br755.cmd}\` define \`${br755.symbolic}\`: só o dono pode alterar o arquivo, enquanto todos podem lê-lo e executá-lo. É o modo usual para diretórios, binários instalados e scripts de shell.`,
      sections: [
        {
          heading: 'O que chmod 755 significa',
          paragraphs: [
            br755.digits,
            `No \`ls -l\` ele aparece como \`${br755.ls}\`. O 7 é 4 + 2 + 1 e cada 5 é 4 + 1, leitura mais execução. Em um diretório, a leitura permite listar os nomes e a execução permite atravessá-lo para abrir arquivos pelo caminho; assim, 755 é um diretório que todos podem navegar, mas onde só o dono pode criar ou remover entradas.`,
          ],
        },
        {
          heading: 'Onde 755 é a escolha certa',
          paragraphs: [
            `Quase todo o \`/usr/bin\` é 755 e pertence ao root: qualquer usuário pode rodar \`ls\` ou \`git\`, e só o root pode substituí-los. O mesmo vale para seus scripts em \`~/bin\` e para a raiz de documentos de um site, onde o servidor precisa entrar em cada diretório, mas não deve conseguir reescrever o site.`,
            `É também o que o \`mkdir\` cria com a umask comum 022: diretórios novos partem de 777 e a umask remove a escrita do grupo e dos outros.`,
          ],
        },
        {
          heading: 'Armadilhas',
          paragraphs: [
            `Em um arquivo de dados comum, 755 é inofensivo, mas enganoso: marca um arquivo de configuração ou uma imagem como executável. Use 644 para arquivos que só são lidos. Além disso, 755 é legível por todas as contas do host, então é o modo errado para segredos; um diretório de credenciais pede 700 ou 750.`,
            `Não aplique com \`chmod -R 755\` em uma árvore mista, ou todo arquivo vira executável. Use \`find dir -type d -exec chmod 755 {} +\` para diretórios, ou a forma simbólica \`chmod -R u=rwX,go=rX dir\`, em que o X maiúsculo só adiciona execução a diretórios e a arquivos que já eram executáveis.`,
          ],
        },
      ],
      faqs: [
        {
          q: 'Qual a diferença entre 755 e 775?',
          a: 'O dígito do meio. 755 dá ao grupo apenas leitura e execução; 775 também dá escrita, então qualquer membro do grupo pode modificar o arquivo ou, em um diretório, criar e apagar entradas. Use 775 em diretórios de projeto compartilhados com um grupo dedicado.',
        },
        {
          q: 'Arquivos web devem ser 755 ou 644?',
          a: 'Diretórios 755, arquivos 644. O servidor web precisa de execução nos diretórios para atravessá-los, mas um arquivo HTML, CSS ou PHP estático só precisa ser legível. Arquivos PHP são lidos pelo interpretador, não executados pelo kernel.',
        },
      ],
    },
  },
  '600': {
    de: {
      slug: '600',
      input: '600',
      h1Name: 'chmod 600',
      headline: 'Lesen und Schreiben nur für den Eigentümer, für Schlüssel und Geheimnisse',
      title: 'chmod 600 Bedeutung — rw------- und SSH-Schlüssel',
      description:
        'chmod 600 (rw-------): Nur der Eigentümer darf lesen und schreiben. Pflicht für private SSH-Schlüssel, richtig für Zugangsdaten und .env-Dateien.',
      lede: `\`${de600.cmd}\` setzt \`${de600.symbolic}\`: Der Eigentümer darf die Datei lesen und schreiben, kein anderes Nicht-root-Konto kann sie öffnen. Das ist der Modus für private Schlüssel, Zugangsdaten und alles, was bei einem Benutzer bleiben soll.`,
      sections: [
        {
          heading: 'Was chmod 600 bedeutet',
          paragraphs: [
            de600.digits,
            `\`ls -l\` zeigt \`${de600.ls}\`. Nirgends ist ein Ausführ-Bit gesetzt, daher ist 600 für Datendateien gedacht; Verzeichnisse brauchen 700, private Skripte ebenfalls.`,
          ],
        },
        {
          heading: 'SSH-Schlüssel und andere Dateien, die 600 verlangen',
          paragraphs: [
            `Der OpenSSH-Client prüft den Modus eines privaten Schlüssels und verweigert einen, den Gruppe oder andere lesen können, mit der Meldung „WARNING: UNPROTECTED PRIVATE KEY FILE!“. \`chmod 600 ~/.ssh/id_ed25519\` behebt das. Auf dem Server hat \`authorized_keys\` üblicherweise ebenfalls 600.`,
            `Andere Werkzeuge setzen dieselbe Regel durch: libpq ignoriert eine \`~/.pgpass\`, die für Gruppe oder alle zugänglich ist, und viele Zugangsdateien wie \`~/.netrc\`, Credential-Dateien von Cloud-Anbietern oder \`.env\` sollten 600 haben, auch wenn nichts es prüft.`,
          ],
        },
        {
          heading: 'Stolperfallen',
          paragraphs: [
            `Modus-Bits schützen nicht vor root, vor Backups oder vor einer Kopie auf einen anderen Rechner: Ein mit \`scp\` kopierter oder aus einem Archiv entpackter Schlüssel kann mit lockereren Rechten ankommen, prüfen Sie nach dem Verschieben also erneut. Container sind ein häufiger Fall — ein eingehängtes Geheimnis braucht unter Umständen den Container-Benutzer als Eigentümer, sonst kann der Prozess eine 600-Datei gar nicht lesen.`,
            `Muss ein separates Dienstkonto die Datei lesen, ist 600 zu streng; nehmen Sie 640 mit gemeinsamer Gruppe, statt auf 644 zu öffnen. Für das Verzeichnis, das solche Dateien enthält, ist 700 das Gegenstück.`,
          ],
        },
        {
          heading: 'Verwandte Werte',
          paragraphs: [
            '600 ist der strengste Modus, bei dem der Eigentümer noch bearbeiten kann. 640 lockert ihn für eine Gruppe, 644 für alle. 400 nimmt auch dem Eigentümer das Schreibrecht; manche Downloads von Cloud-Schlüsseln kommen so an, und ssh akzeptiert das. Auf einem Verzeichnis fehlte bei 600 das Ausführ-Bit, das der Eigentümer zum Betreten braucht, daher bekommen Verzeichnisse 700.',
          ],
        },
      ],
      faqs: [
        {
          q: 'Warum meldet ssh, die Rechte meines privaten Schlüssels seien zu offen?',
          a: 'Die Schlüsseldatei ist für Gruppe oder andere lesbar, typischerweise 644. ssh lehnt solche Schlüssel ab. Führen Sie chmod 600 auf dem Schlüssel aus und stellen Sie sicher, dass Ihnen die Datei gehört.',
        },
        {
          q: 'Sollten .env-Dateien 600 haben?',
          a: 'Ja, wenn nur der Eigentümer sie liest. Läuft ein Webserver oder eine App unter einem anderen Konto, geben Sie der Datei 640 und die Gruppe dieses Kontos, damit sie trotzdem nicht für alle lesbar ist.',
        },
      ],
    },
    fr: {
      slug: '600',
      input: '600',
      h1Name: 'chmod 600',
      headline: 'lecture et écriture pour le seul propriétaire, pour clés et secrets',
      title: 'chmod 600 : signification — rw------- et clés SSH',
      description:
        'chmod 600 (rw-------) : seul le propriétaire peut lire et écrire. Le mode exigé pour les clés privées SSH, idéal pour identifiants et fichiers .env.',
      lede: `\`${fr600.cmd}\` applique \`${fr600.symbolic}\` : le propriétaire peut lire et écrire le fichier, et aucun autre compte non root ne peut l’ouvrir. C’est le mode des clés privées, des identifiants et de tout ce qui doit rester à un seul utilisateur.`,
      sections: [
        {
          heading: 'Ce que signifie chmod 600',
          paragraphs: [
            fr600.digits,
            `\`ls -l\` affiche \`${fr600.ls}\`. Aucun bit d’exécution n’est présent, donc 600 sert aux fichiers de données ; les répertoires ont besoin de 700, tout comme les scripts privés.`,
          ],
        },
        {
          heading: 'Les clés SSH et les autres fichiers qui l’exigent',
          paragraphs: [
            `Le client OpenSSH vérifie le mode d’une clé privée et refuse celle que le groupe ou les autres peuvent lire, en affichant « WARNING: UNPROTECTED PRIVATE KEY FILE! ». \`chmod 600 ~/.ssh/id_ed25519\` règle le problème. Côté serveur, \`authorized_keys\` est lui aussi conventionnellement en 600.`,
            `D’autres outils appliquent la même règle : libpq ignore un \`~/.pgpass\` accessible au groupe ou à tous, et beaucoup de fichiers d’identifiants (\`~/.netrc\`, fichiers de credentials des fournisseurs cloud, \`.env\`) devraient être en 600 même quand rien ne le vérifie.`,
          ],
        },
        {
          heading: 'Pièges',
          paragraphs: [
            `Les bits de mode ne protègent ni contre root, ni contre les sauvegardes, ni contre une copie sur une autre machine : une clé copiée avec \`scp\` ou extraite d’une archive peut arriver avec des droits plus larges, revérifiez donc après l’avoir déplacée. Les conteneurs sont un cas fréquent : un secret monté dans un conteneur peut devoir appartenir à l’utilisateur du conteneur, sinon le processus ne peut pas lire un fichier en 600.`,
            `Si un compte de service distinct doit lire le fichier, 600 est trop strict ; utilisez 640 avec un groupe partagé plutôt que d’ouvrir en 644. Pour le répertoire qui contient ces fichiers, 700 est le pendant naturel.`,
          ],
        },
        {
          heading: 'Valeurs voisines',
          paragraphs: [
            '600 est le mode le plus strict qui laisse encore le propriétaire modifier le fichier. 640 l’assouplit pour un groupe, 644 pour tout le monde. 400 retire aussi l’écriture au propriétaire ; certains téléchargements de clés cloud arrivent ainsi, et ssh l’accepte. Sur un répertoire, 600 omettrait le bit d’exécution dont le propriétaire a besoin pour y entrer : les répertoires prennent donc 700.',
          ],
        },
      ],
      faqs: [
        {
          q: 'Pourquoi ssh dit-il que les permissions de ma clé privée sont trop ouvertes ?',
          a: 'Le fichier de clé est lisible par le groupe ou les autres, typiquement en 644. ssh refuse ces clés. Lancez chmod 600 sur la clé et vérifiez que le fichier vous appartient bien.',
        },
        {
          q: 'Les fichiers .env doivent-ils être en 600 ?',
          a: 'Oui, si seul le propriétaire les lit. Si un serveur web ou une application tourne sous un autre compte, passez le fichier en 640 avec le groupe de ce compte, pour qu’il ne soit toujours pas lisible par tous.',
        },
      ],
    },
    'pt-br': {
      slug: '600',
      input: '600',
      h1Name: 'chmod 600',
      headline: 'leitura e escrita só para o dono, para chaves e segredos',
      title: 'chmod 600: o que significa — rw------- e chaves SSH',
      description:
        'chmod 600 (rw-------): só o dono pode ler e escrever. O modo exigido para chaves privadas SSH e o padrão certo para credenciais e arquivos .env.',
      lede: `\`${br600.cmd}\` define \`${br600.symbolic}\`: o dono pode ler e escrever o arquivo, e nenhuma outra conta que não seja root consegue abri-lo. É o modo para chaves privadas, credenciais e tudo o que deve ficar com um único usuário.`,
      sections: [
        {
          heading: 'O que chmod 600 significa',
          paragraphs: [
            br600.digits,
            `O \`ls -l\` mostra \`${br600.ls}\`. Não há bit de execução em lugar nenhum, então 600 serve para arquivos de dados; diretórios precisam de 700, e scripts privados também.`,
          ],
        },
        {
          heading: 'Chaves SSH e outros arquivos que exigem 600',
          paragraphs: [
            `O cliente OpenSSH confere o modo de uma chave privada e recusa uma que o grupo ou os outros possam ler, exibindo "WARNING: UNPROTECTED PRIVATE KEY FILE!". \`chmod 600 ~/.ssh/id_ed25519\` resolve. No servidor, o \`authorized_keys\` também costuma ser 600.`,
            `Outras ferramentas aplicam a mesma regra: a libpq ignora um \`~/.pgpass\` acessível ao grupo ou a todos, e muitos arquivos de credenciais (\`~/.netrc\`, arquivos de credenciais de provedores de nuvem, \`.env\`) deveriam ser 600 mesmo quando nada verifica.`,
          ],
        },
        {
          heading: 'Armadilhas',
          paragraphs: [
            `Os bits de modo não protegem contra o root, contra backups nem contra uma cópia para outra máquina: uma chave copiada com \`scp\` ou extraída de um arquivo compactado pode chegar com permissões mais abertas, então confira de novo depois de movê-la. Contêineres são um caso comum: um segredo montado em um contêiner pode precisar ter como dono o usuário do contêiner, ou o processo não consegue ler um arquivo 600.`,
            `Se uma conta de serviço separada precisa ler o arquivo, 600 é restrito demais; use 640 com um grupo compartilhado em vez de abrir para 644. Para o diretório que guarda esses arquivos, 700 é o par natural.`,
          ],
        },
        {
          heading: 'Valores relacionados',
          paragraphs: [
            'O 600 é o modo mais restrito que ainda deixa o dono editar. O 640 o relaxa para um grupo, o 644 para todos. O 400 tira também a escrita do dono; alguns downloads de chaves de nuvem já vêm assim, e o ssh aceita. Um 600 em um diretório deixaria de fora o bit de execução de que o dono precisa para entrar nele, por isso diretórios usam 700.',
          ],
        },
      ],
      faqs: [
        {
          q: 'Por que o ssh diz que as permissões da minha chave privada estão abertas demais?',
          a: 'O arquivo da chave pode ser lido pelo grupo ou pelos outros, normalmente 644. O ssh recusa essas chaves. Rode chmod 600 na chave e confirme que você é o dono do arquivo.',
        },
        {
          q: 'Arquivos .env devem ser 600?',
          a: 'Sim, se só o dono os lê. Se um servidor web ou uma aplicação roda com outra conta, deixe o arquivo em 640 com o grupo dessa conta, para que ele continue não legível por todos.',
        },
      ],
    },
  },
  '700': {
    de: {
      slug: '700',
      input: '700',
      h1Name: 'chmod 700',
      headline: 'privat für den Eigentümer, der Modus für ~/.ssh',
      title: 'chmod 700 Bedeutung — rwx------ und ~/.ssh',
      description:
        'chmod 700 (rwx------): Der Eigentümer erhält volle Kontrolle, alle anderen nichts. Der empfohlene Modus für ~/.ssh und andere private Verzeichnisse.',
      lede: `\`${de700.cmd}\` setzt \`${de700.symbolic}\`: Der Eigentümer darf lesen, schreiben und ausführen, kein anderes Nicht-root-Konto darf irgendetwas. Das ist der Standardmodus für \`~/.ssh\` und private Skriptverzeichnisse.`,
      sections: [
        {
          heading: 'Was chmod 700 bedeutet',
          paragraphs: [
            de700.digits,
            `\`ls -l\` zeigt \`${de700.ls}\`. Auf einem Verzeichnis bedeuten die beiden Nullen, dass andere Benutzer es weder auflisten noch durchqueren können — damit sind auch alle Dateien darin verborgen, ganz gleich, welche Modi sie selbst haben.`,
          ],
        },
        {
          heading: 'Der Fall ~/.ssh',
          paragraphs: [
            `OpenSSH prüft Berechtigungen, bevor es Ihren Schlüsseln vertraut. Mit der Server-Voreinstellung \`StrictModes yes\` verweigert sshd die Public-Key-Anmeldung, wenn Ihr Home-Verzeichnis, \`~/.ssh\` oder \`authorized_keys\` für Gruppe oder andere beschreibbar ist. Die übliche Lösung ist \`chmod 700 ~/.ssh\` und \`chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_*\`; die \`.pub\`-Dateien dürfen 644 bleiben.`,
            `Dieselbe Überlegung gilt für \`~/.gnupg\`, bei dem GnuPG warnt, wenn andere darauf zugreifen können, und für jedes Verzeichnis mit Zugangsdaten oder Tokens.`,
          ],
        },
        {
          heading: 'Weitere Einsätze und Grenzen',
          paragraphs: [
            `700 passt zu einem persönlichen Skript, das Geheimnisse liest, und zu Arbeits- oder Build-Verzeichnissen, die einem einzigen Dienstkonto gehören. Root wird durch diese Bits nicht eingeschränkt: Ein Administrator oder alles, was als root läuft, kann den Inhalt trotzdem lesen. Dateimodi schützen Benutzer voreinander, nicht vor dem Besitzer der Maschine.`,
            `Wenden Sie 700 nicht rekursiv auf reine Datendateien an, sie erhielten ein unnötiges Ausführ-Bit. Geben Sie Verzeichnissen 700 und Dateien 600, getrennt mit \`find -type d\` und \`find -type f\`, oder nutzen Sie \`chmod -R u=rwX,go= dir\`.`,
          ],
        },
        {
          heading: 'Verwandte Werte',
          paragraphs: [
            '700 ist der privateste Verzeichnismodus. 750 öffnet ihn für eine Gruppe, nur Lesen und Durchqueren — der übliche nächste Schritt, wenn ein Dienst den Inhalt lesen muss. 755 öffnet ihn für jedes Konto. Für die Dateien darin ist 600 der passende private Modus, 640 der gruppenlesbare. Finden Sie ein privates Verzeichnis mit 777, betrachten Sie seinen Inhalt als offengelegt und tauschen Sie die Geheimnisse darin aus.',
          ],
        },
      ],
      faqs: [
        {
          q: 'Warum ignoriert SSH meinen Schlüssel, nachdem ich ~/.ssh kopiert habe?',
          a: 'Kopien kommen oft mit lockereren Modi an, und sshd mit StrictModes lehnt Schlüssel ab, wenn ~/.ssh oder authorized_keys für Gruppe oder alle beschreibbar ist. Setzen Sie ~/.ssh auf 700 und die Dateien darin auf 600, und prüfen Sie, dass auch Ihr Home-Verzeichnis nicht gruppenbeschreibbar ist.',
        },
        {
          q: 'Was ist der Unterschied zwischen 700 und 600?',
          a: '700 enthält Ausführen für den Eigentümer, 600 nicht. Nehmen Sie 700 für Verzeichnisse, die zum Betreten Ausführen brauchen, und für Skripte; 600 für private Dateien, die nur gelesen und geschrieben werden.',
        },
      ],
    },
    fr: {
      slug: '700',
      input: '700',
      h1Name: 'chmod 700',
      headline: 'privé pour le propriétaire, le mode de ~/.ssh',
      title: 'chmod 700 : signification — rwx------ et ~/.ssh',
      description:
        'chmod 700 (rwx------) : le propriétaire a le contrôle total et personne d’autre n’a rien. Le mode recommandé pour ~/.ssh et les autres répertoires privés.',
      lede: `\`${fr700.cmd}\` applique \`${fr700.symbolic}\` : le propriétaire peut lire, écrire et exécuter, et aucun autre compte non root ne peut rien faire. C’est le mode standard de \`~/.ssh\` et des répertoires de scripts privés.`,
      sections: [
        {
          heading: 'Ce que signifie chmod 700',
          paragraphs: [
            fr700.digits,
            `\`ls -l\` affiche \`${fr700.ls}\`. Sur un répertoire, les deux zéros signifient que les autres utilisateurs ne peuvent ni le lister ni le traverser, ce qui cache aussi tous les fichiers qu’il contient, quels que soient leurs propres modes.`,
          ],
        },
        {
          heading: 'Le cas de ~/.ssh',
          paragraphs: [
            `OpenSSH vérifie les permissions avant de faire confiance à vos clés. Avec la valeur par défaut du serveur \`StrictModes yes\`, sshd refuse la connexion par clé publique si votre répertoire personnel, \`~/.ssh\` ou \`authorized_keys\` est modifiable par le groupe ou les autres. La correction habituelle est \`chmod 700 ~/.ssh\` puis \`chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_*\`, les fichiers \`.pub\` pouvant rester en 644.`,
            `Le même raisonnement vaut pour \`~/.gnupg\`, au sujet duquel GnuPG avertit lorsqu’il est accessible aux autres, et pour tout répertoire contenant des identifiants ou des jetons.`,
          ],
        },
        {
          heading: 'Autres usages et limites',
          paragraphs: [
            `700 convient à un script personnel qui lit des secrets, et aux répertoires de travail ou de build qu’un seul compte de service possède. Root n’est pas limité par ces bits : un administrateur, ou tout ce qui tourne sous root, peut quand même lire le contenu. Les modes de fichier protègent les utilisateurs les uns des autres, pas du propriétaire de la machine.`,
            `N’appliquez pas 700 récursivement à des fichiers de simples données ; ils gagneraient un bit d’exécution inutile. Donnez 700 aux répertoires et 600 aux fichiers en séparant avec \`find -type d\` et \`find -type f\`, ou utilisez \`chmod -R u=rwX,go= dir\`.`,
          ],
        },
        {
          heading: 'Valeurs voisines',
          paragraphs: [
            '700 est le mode de répertoire le plus privé. 750 l’ouvre à un groupe, en lecture et traversée seulement, ce qui est l’étape suivante habituelle quand un service doit lire le contenu. 755 l’ouvre à tous les comptes. Pour les fichiers qu’il contient, 600 est le mode privé assorti et 640 la version lisible par le groupe. Si vous trouvez un répertoire privé en 777, considérez son contenu comme exposé et renouvelez les secrets qu’il contient.',
          ],
        },
      ],
      faqs: [
        {
          q: 'Pourquoi SSH ignore-t-il ma clé après une copie de ~/.ssh ?',
          a: 'Les copies arrivent souvent avec des modes plus larges, et sshd avec StrictModes refuse les clés quand ~/.ssh ou authorized_keys est modifiable par le groupe ou par tous. Passez ~/.ssh en 700 et les fichiers qu’il contient en 600, et vérifiez que votre répertoire personnel n’est pas modifiable par le groupe.',
        },
        {
          q: 'Quelle différence entre 700 et 600 ?',
          a: '700 inclut l’exécution pour le propriétaire, 600 non. Utilisez 700 pour les répertoires, qui ont besoin de l’exécution pour qu’on y entre, et pour les scripts ; 600 pour les fichiers privés qui sont seulement lus et écrits.',
        },
      ],
    },
    'pt-br': {
      slug: '700',
      input: '700',
      h1Name: 'chmod 700',
      headline: 'privado para o dono, o modo do ~/.ssh',
      title: 'chmod 700: o que significa — rwx------ e ~/.ssh',
      description:
        'chmod 700 (rwx------): o dono tem controle total e ninguém mais tem nada. O modo recomendado para o ~/.ssh e outros diretórios privados.',
      lede: `\`${br700.cmd}\` define \`${br700.symbolic}\`: o dono pode ler, escrever e executar, e nenhuma outra conta que não seja root pode fazer nada. É o modo padrão do \`~/.ssh\` e de diretórios de scripts privados.`,
      sections: [
        {
          heading: 'O que chmod 700 significa',
          paragraphs: [
            br700.digits,
            `O \`ls -l\` mostra \`${br700.ls}\`. Em um diretório, os dois zeros significam que outros usuários não podem listá-lo nem atravessá-lo, o que também esconde todos os arquivos lá dentro, sejam quais forem os modos deles.`,
          ],
        },
        {
          heading: 'O caso do ~/.ssh',
          paragraphs: [
            `O OpenSSH confere as permissões antes de confiar nas suas chaves. Com o padrão do servidor \`StrictModes yes\`, o sshd recusa o login por chave pública se o seu diretório home, o \`~/.ssh\` ou o \`authorized_keys\` puder ser gravado pelo grupo ou pelos outros. A correção usual é \`chmod 700 ~/.ssh\` e \`chmod 600 ~/.ssh/authorized_keys ~/.ssh/id_*\`, deixando os arquivos \`.pub\` em 644 se quiser.`,
            `O mesmo raciocínio vale para o \`~/.gnupg\`, sobre o qual o GnuPG avisa quando outros têm acesso, e para qualquer diretório que guarde credenciais ou tokens.`,
          ],
        },
        {
          heading: 'Outros usos e limites',
          paragraphs: [
            `O 700 é certo para um script pessoal que lê segredos e para diretórios de trabalho ou de build que pertencem a uma única conta de serviço. O root não é limitado por esses bits: um administrador, ou qualquer coisa rodando como root, ainda consegue ler o conteúdo. Modos de arquivo protegem usuários uns dos outros, não do dono da máquina.`,
            `Não aplique 700 de forma recursiva a arquivos que são só dados; eles ganhariam um bit de execução desnecessário. Dê 700 aos diretórios e 600 aos arquivos separando com \`find -type d\` e \`find -type f\`, ou use \`chmod -R u=rwX,go= dir\`.`,
          ],
        },
        {
          heading: 'Valores relacionados',
          paragraphs: [
            'O 700 é o modo de diretório mais privado. O 750 o abre para um grupo, só leitura e travessia, que é o próximo passo usual quando um serviço precisa ler o conteúdo. O 755 o abre para todas as contas. Para os arquivos dentro dele, 600 é o modo privado correspondente e 640 o legível pelo grupo. Se encontrar um diretório privado em 777, trate o conteúdo como exposto e troque os segredos que estiverem nele.',
          ],
        },
      ],
      faqs: [
        {
          q: 'Por que o SSH ignora minha chave depois que copiei o ~/.ssh?',
          a: 'Cópias costumam chegar com modos mais abertos, e o sshd com StrictModes recusa chaves quando o ~/.ssh ou o authorized_keys pode ser gravado pelo grupo ou por todos. Deixe o ~/.ssh em 700 e os arquivos dentro em 600, e confira se o seu diretório home também não é gravável pelo grupo.',
        },
        {
          q: 'Qual a diferença entre 700 e 600?',
          a: 'O 700 inclui execução para o dono e o 600 não. Use 700 em diretórios, que precisam de execução para serem acessados, e em scripts; use 600 em arquivos privados que só são lidos e gravados.',
        },
      ],
    },
  },
};

/** Locales with a real page for this mode (hreflang must list only these). */
export function localesFor(slug: string): VariantLocale[] {
  return Object.keys(chmodI18n[slug] ?? {}) as VariantLocale[];
}

/** Every entry for one locale, in registry order. */
/** A locale's pages in the English registry order (777, 755, 600, 700) — object keys that look like numbers would sort. */
export function variantsFor(lang: VariantLocale): ToolVariant[] {
  return chmodVariants.flatMap((v) => {
    const t = chmodI18n[v.slug]?.[lang];
    return t ? [t] : [];
  });
}
