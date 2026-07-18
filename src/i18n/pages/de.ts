import type { PagesContent } from './en';

const UPDATED = '2026-07-18';

const de: Partial<PagesContent> = {
  ui: {
    updatedLabel: 'Zuletzt aktualisiert',
    consent: {
      label: 'Analyse-Cookies erlauben',
      on: 'Analyse-Cookies sind aktiv. Deaktivieren Sie das Kästchen, um zum cookielosen Modus zurückzukehren.',
      off: 'Derzeit cookielos — ohne Ihre Zustimmung wird kein Analyse-Cookie gesetzt.',
    },
  },

  privacy: {
    metaTitle: 'Datenschutzerklärung',
    description:
      'Wie OpsCanopy mit Ihren Daten umgeht: Jedes Tool läuft vollständig in Ihrem Browser. Nichts, was Sie einfügen, wird hochgeladen, protokolliert oder weitergegeben. Keine Konten, kein Tracking.',
    eyebrow: 'Datenschutz',
    heading: 'Ihre Daten verlassen niemals Ihr Gerät.',
    lead: 'OpsCanopy ist nach dem Prinzip „Privacy First“ aufgebaut. Jedes Tool läuft vollständig in Ihrem Browser — es gibt keinen Server, der Ihre Eingaben empfängt, kein Konto, das Sie erstellen müssen, und nichts, was hochgeladen wird. Diese Erklärung erläutert genau, was das bedeutet.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Die Kurzfassung',
        body: [
          'Der Text, die Dateien und die Konfiguration, die Sie in ein OpsCanopy-Tool einfügen, werden lokal in Ihrem eigenen Browser-Tab verarbeitet. Sie werden niemals an uns oder an Dritte gesendet und nach dem Schließen des Tabs niemals gespeichert.',
          'Wir betreiben keine Benutzerkonten, wir verlangen keine Registrierung, und wir führen keine Datenbank über Ihre Aktivitäten.',
        ],
      },
      {
        heading: 'Was wir in Ihrem Browser verarbeiten',
        body: [
          'Jedes Tool ist ein kleines Programm, das als clientseitiges JavaScript (oder WebAssembly) ausgeführt wird. Wenn Sie eine Logzeile, eine Alert-Regel, eine CIDR-Liste oder eine andere Eingabe einfügen, findet die Berechnung auf Ihrem Rechner statt. Die Ergebnisse, die Sie sehen, werden lokal erzeugt und verschwinden aus dem Speicher, sobald Sie die Seite verlassen.',
          'Da die Verarbeitung lokal erfolgt, funktionieren die Tools auch offline weiter, sobald die Seite geladen wurde.',
        ],
      },
      {
        heading: 'Was wir nicht erfassen',
        body: [
          'Wir erfassen nicht den Inhalt Ihrer Eingaben oder Ausgaben. Wir verwenden keine Werbe-Cookies, keine seitenübergreifenden Tracker und kein Fingerprinting. Wir verkaufen, vermieten oder teilen keine personenbezogenen Daten, weil wir sie gar nicht erst erheben. Unsere einzige Messung ist die unten beschriebene, standardmäßig cookielose Web-Analyse.',
          'Jede Einstellung, die sich die Website merkt — etwa Ihr helles/dunkles Theme oder Ihre Sprache —, wird im lokalen Speicher Ihres Browsers auf Ihrem Gerät abgelegt und niemals an uns übertragen.',
        ],
      },
      {
        heading: 'Was die Website auf Ihrem Gerät speichert',
        body: [
          'Alles, was sich OpsCanopy merkt, wird im lokalen Speicher Ihres Browsers auf Ihrem Gerät abgelegt, unter einer Handvoll benannter Schlüssel, die Sie jederzeit einsehen und löschen können. Nichts davon wird an uns übertragen. Aktuell sind das folgende Schlüssel:',
          'theme — Ihre Wahl des hellen oder dunklen Themes.',
          'oc-analytics-consent — Ihre Entscheidung zur Web-Analyse, festgelegt über den Schalter auf dieser Seite.',
          'oc-m90-v1 — Ihr Fortschritt bei Mission 90 Days DevOps: welche Tage und Missionen Sie in diesem Browser als erledigt markiert haben.',
          'oc-m90-backup-meta — wann Sie diesen Fortschritt zuletzt gesichert haben (und ob Sie die Backup-Erinnerung ausgeblendet haben), damit der Mission-90-Hub weiß, wann sich eine Erinnerung lohnt.',
          'opscanopy:tools:sort — wie Sie den Tool-Katalog zuletzt sortiert haben.',
          'oc-roadmap-… (ein Schlüssel pro Lern-Roadmap) — welche Themen Sie auf dieser Roadmap abgehakt haben.',
          'oc-guide-…-pos (ein Schlüssel pro Guide) — Ihre letzte Leseposition in diesem Guide.',
          'oc-tools-v1 — Tools, die Sie angeheftet haben, sowie die zuletzt verwendeten — damit die Bereiche „Schnellzugriff" und „Ihre Tools" sie anzeigen können.',
          'Das Löschen der Websitedaten in Ihrem Browser entfernt all diese Einträge. Der Mission-90-Fortschritt kann ein Löschen mithilfe der Backup-Datei oder des Backup-Codes aus dem Mission-90-Hub überstehen.',
        ],
      },
      {
        heading: 'Hosting und Server-Logs',
        body: [
          'OpsCanopy wird als statische Dateien über einen Hosting-Anbieter und ein Content Delivery Network ausgeliefert. Wie praktisch alle Webhoster können diese Anbieter kurzlebige, standardmäßige Request-Logs führen (zum Beispiel eine IP-Adresse und den Browser-User-Agent), um Seiten auszuliefern, Missbrauch einzudämmen und den Dienst sicher zu halten. Diese Logs sind betrieblicher Natur und werden nicht zur Profilbildung über Sie verwendet.',
        ],
      },
      {
        heading: 'Web-Analyse',
        body: [
          'Wir verwenden Google Analytics 4, um zu verstehen, welche Tools und Guides tatsächlich nützlich sind: Seitenaufrufe sowie eine Handvoll anonymer Produkt-Ereignisse (zum Beispiel „auf dieser Seite wurde ein Ergebnis kopiert“ oder „ein Mission-90-Tag wurde als abgeschlossen markiert“). Diese Ereignisse enthalten nur den Seitenpfad — niemals etwas, das Sie in ein Tool eingeben oder einfügen.',
          'Standardmäßig läuft die Analyse im cookielosen Modus („Einwilligung verweigert“): Es wird kein Analyse-Cookie gesetzt und keine dauerhafte Kennung auf Ihrem Gerät gespeichert, es sei denn, Sie stimmen über den Schalter unten ausdrücklich zu. Sie können Ihre Wahl jederzeit auf dieser Seite ändern — die Website funktioniert in beiden Fällen identisch.',
        ],
      },
      {
        heading: 'Dienste von Drittanbietern',
        body: [
          'Abgesehen vom oben beschriebenen Analyse-Skript halten wir externe Abhängigkeiten auf ein Minimum — Schriftarten werden selbst gehostet, und die Seiten laden keinen weiteren Drittanbieter-Code. Wir binden keine Werbenetzwerke oder Social-Tracking-Pixel ein.',
        ],
      },
      {
        heading: 'Änderungen dieser Erklärung',
        body: [
          'Wenn sich diese Erklärung ändert, aktualisieren wir das oben auf dieser Seite angezeigte Datum. Die weitere Nutzung der Tools nach einer Aktualisierung bedeutet, dass Sie die überarbeitete Erklärung akzeptieren.',
        ],
      },
      {
        heading: 'Fragen',
        body: [
          'Fragen zum Datenschutz sind willkommen. Am besten erreichen Sie uns über unsere öffentliche GitHub-Organisation — den Link finden Sie auf der Kontaktseite.',
        ],
      },
    ],
  },

  about: {
    metaTitle: 'Über OpsCanopy',
    description:
      'OpsCanopy ist ein wachsendes Dach kostenloser, privater, browserbasierter Tools für Plattform- und DevOps-Engineers — Validatoren, Konverter, Tester und Linter, die niemals einen Server berühren.',
    eyebrow: 'Über uns',
    heading: 'Kostenlose DevOps-Tools, die vollständig in Ihrem Browser laufen.',
    lead: 'OpsCanopy ist eine wachsende Sammlung fokussierter Werkzeuge für Plattform- und DevOps-Engineers. Jedes löst ein kleines, reales Problem — und jedes läuft zu 100 % clientseitig, sodass die Dinge, die Sie einfügen, niemals Ihr Gerät verlassen.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Warum es existiert',
        body: [
          'Engineers greifen Dutzende Male am Tag zu schnellen Tools: eine Workflow-Datei validieren, ein Token decodieren, eine Regex gegen Logzeilen testen, ein Subnetz berechnen, eine Suppression-Datei konvertieren. Zu viele dieser Tools verlangen, dass Sie sensible interne Daten in eine Website einfügen, die sie heimlich auf einen Server hochlädt.',
          'OpsCanopy verfolgt den umgekehrten Ansatz. Die Tools sind schnell, kostenlos und durch ihre Bauweise privat — nichts, was Sie einfügen, wird jemals übertragen, weil es nirgendwo hingehen kann.',
          'Das schließt KI-Assistenten ein: Auch ein Chat-Fenster ist ein Dritter, und alles, was Sie dort einfügen, landet auf den Servern eines Dritten. Ein Tool, das lokal rechnet, bringt Sie gar nicht erst in diese Lage.',
        ],
      },
      {
        heading: 'Prinzipien',
        body: [
          'Ausschließlich lokal — durch die Bauweise. Es gibt keinen Server, der Ihre Eingaben empfangen könnte — Datenschutz ist hier Architektur, kein Versprechen in einer Richtlinie.',
          'Deterministisch statt plausibel. Die Tools berechnen ihre Ausgaben mit echten Parsern und exakter Arithmetik, statt plausibel aussehenden Text vorherzusagen.',
          'Für immer kostenlos, ohne Konten. Keine Bezahlschranke, keine Registrierung, keine E-Mail-Erfassung — öffnen Sie ein Tool und nutzen Sie es.',
          'Open Source, damit Sie es prüfen können. Der vollständige Code ist öffentlich auf GitHub, und Sie können genau nachlesen, was jedes Tool berechnet.',
        ],
      },
      {
        heading: 'Wie es funktioniert',
        body: [
          'Die gesamte Website ist statisch. Jedes Tool ist ein eigenständiges Programm, das in Ihrem Browser mit JavaScript und, wo es hilft, WebAssembly läuft. Es gibt kein Backend, keine API und kein Kontosystem. Sobald eine Seite geladen ist, funktionieren die meisten Tools auch ohne Netzwerkverbindung weiter.',
        ],
      },
      {
        heading: 'Wie es gebaut und getestet wird',
        body: [
          'Die Engines sind reines TypeScript. Wo es für Korrektheit eine maßgebliche Instanz gibt, sind die Tests daran gebunden — das /31-Subnetzverhalten nach RFC 3021, NIST-Hash-Testvektoren und ein versioniertes Konformitätskorpus für den GitHub-Actions-Expression-Tester.',
          'Die Engines nehmen Text entgegen und liefern Ergebnisse zurück — keine Netzwerkaufrufe, nichts Verstecktes —, sodass sich jedes Verhalten, das ein Tool für sich beansprucht, in einem Test reproduzieren lässt.',
        ],
      },
      {
        heading: 'Für wen es gedacht ist',
        body: [
          'Es ist für Plattform-Engineers, SREs, DevOps-Praktiker und alle gebaut, die nah an der Infrastruktur arbeiten — aber die Tools sind für jede Entwicklerin und jeden Entwickler nützlich, die schnell eine private Antwort möchten, ohne etwas installieren zu müssen.',
        ],
      },
      {
        heading: 'Wer es baut',
        body: [
          'OpsCanopy wird von Pushkar Kumar und Asif Khan entwickelt und gepflegt — Engineers, die es leid waren, sensible Konfigurationen in beliebige Web-Tools einzufügen, und sich stattdessen entschieden, schnelle, private, clientseitige Alternativen zu bauen.',
          'Pushkar Kumar — [PLACEHOLDER: real background in his own words; this page must not deploy until this is filled in].',
          'Asif Khan — [PLACEHOLDER: real background in his own words; this page must not deploy until this is filled in].',
          'Die Entwicklung findet offen auf GitHub statt: Dort können Sie genau prüfen, wie sich jedes Tool verhält, einen Fehler melden oder das nächste Werkzeug vorschlagen.',
        ],
      },
    ],
    links: [
      { label: 'OpsCanopy auf GitHub', href: 'https://github.com/opscanopy/opscanopy.com', external: true },
      { label: 'Ein Problem melden', href: 'https://github.com/opscanopy/opscanopy.com/issues', external: true },
    ],
  },

  terms: {
    metaTitle: 'Allgemeine Geschäftsbedingungen',
    description:
      'Die verständlichen Nutzungsbedingungen für OpsCanopy — kostenlose, browserbasierte DevOps-Tools, bereitgestellt „wie besehen“, ohne Gewährleistung und ohne Haftung dafür, wie Sie die Ausgaben verwenden.',
    eyebrow: 'Bedingungen',
    heading: 'Allgemeine Geschäftsbedingungen.',
    lead: 'Diese Bedingungen regeln Ihre Nutzung von OpsCanopy und seinen Tools. Sie sind in verständlicher Sprache verfasst und bewusst kurz gehalten. Durch die Nutzung der Website stimmen Sie ihnen zu.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Annahme dieser Bedingungen',
        body: [
          'Durch den Zugriff auf OpsCanopy oder dessen Nutzung erklären Sie sich mit diesen Bedingungen einverstanden. Wenn Sie nicht einverstanden sind, nutzen Sie die Website bitte nicht.',
        ],
      },
      {
        heading: 'Nutzung der Tools',
        body: [
          'OpsCanopy stellt kostenlose Werkzeuge für Ihre eigene rechtmäßige Nutzung bereit. Sie dürfen die Tools für private und kommerzielle Arbeit verwenden. Sie verpflichten sich, die Website nicht zu missbrauchen — etwa durch den Versuch, sie zu stören, zu überlasten oder damit gegen das Gesetz zu verstoßen.',
          'Da jedes Tool in Ihrem Browser läuft, sind Sie für die von Ihnen bereitgestellten Eingaben verantwortlich sowie dafür, die Ausgaben zu prüfen, bevor Sie sich darauf verlassen.',
        ],
      },
      {
        heading: 'Keine Gewährleistung',
        body: [
          'Die Tools werden „wie besehen“ und „wie verfügbar“ bereitgestellt, ohne jegliche Gewährleistung, weder ausdrücklich noch stillschweigend. Wir gewährleisten nicht, dass die Tools korrekt, fehlerfrei, unterbrechungsfrei oder für einen bestimmten Zweck geeignet sind. Überprüfen Sie kritische Änderungen — einschließlich Netzwerk-, Sicherheits-, Scheduling- und Konfigurationsausgaben — stets anhand Ihrer eigenen maßgeblichen Quellen, bevor Sie sie anwenden.',
        ],
      },
      {
        heading: 'Haftungsbeschränkung',
        body: [
          'Soweit gesetzlich zulässig, haften OpsCanopy und seine Mitwirkenden nicht für direkte, indirekte, beiläufige oder Folgeschäden, die aus Ihrer Nutzung oder der Unmöglichkeit der Nutzung der Website oder ihrer Tools entstehen — einschließlich aller Entscheidungen, die auf Grundlage ihrer Ausgaben getroffen werden.',
        ],
      },
      {
        heading: 'Marken',
        body: [
          'Produkt- und Firmennamen, auf die die Tools verweisen — einschließlich Grafana, Loki, Prometheus, Kubernetes, GitHub Actions und anderer —, sind die Marken ihrer jeweiligen Inhaber. OpsCanopy ist nicht mit ihnen verbunden und wird von ihnen nicht unterstützt. Loki und Grafana sind Marken von Raintank, Inc.',
        ],
      },
      {
        heading: 'Änderungen dieser Bedingungen',
        body: [
          'Wir können diese Bedingungen von Zeit zu Zeit aktualisieren. In diesem Fall überarbeiten wir das Datum oben auf dieser Seite. Ihre weitere Nutzung der Website nach einer Änderung bedeutet, dass Sie die aktualisierten Bedingungen akzeptieren.',
        ],
      },
      {
        heading: 'Kontakt',
        body: [
          'Wenn Sie Fragen zu diesen Bedingungen haben, erreichen Sie uns über die auf der Kontaktseite aufgeführten Kanäle.',
        ],
      },
    ],
  },

  contact: {
    metaTitle: 'Kontakt',
    description:
      'Nehmen Sie Kontakt mit OpsCanopy auf. Melden Sie einen Fehler, schlagen Sie ein Tool vor oder stellen Sie eine Frage über unsere öffentliche GitHub-Organisation.',
    eyebrow: 'Kontakt',
    heading: 'Kontakt aufnehmen.',
    lead: 'OpsCanopy wird offen entwickelt und gepflegt. Der schnellste Weg, einen Fehler zu melden, eine Funktion vorzuschlagen oder eine Frage zu stellen, führt über unsere öffentliche GitHub-Organisation.',
    sections: [
      {
        heading: 'Fehler & Funktionswünsche',
        body: [
          'Etwas funktioniert nicht oder Sie haben eine Idee für ein Tool, das Sie sich wünschen? Erstellen Sie ein Issue auf GitHub. Klare, reproduzierbare Berichte — was Sie eingefügt haben, was Sie erwartet haben und was passiert ist — helfen uns, Probleme schnell zu beheben.',
        ],
      },
      {
        heading: 'Allgemeine Fragen',
        body: [
          'Für alles andere — einschließlich Datenschutzfragen oder allgemeinem Feedback — ist GitHub der beste Weg, uns zu erreichen. Wir lesen alles, auch wenn eine Antwort etwas dauern kann.',
        ],
      },
    ],
    links: [
      { label: 'E-Mail an hello@opscanopy.com', href: 'mailto:hello@opscanopy.com' },
      {
        label: 'Ein Problem melden',
        href: 'https://github.com/opscanopy/opscanopy.com/issues/new',
        external: true,
      },
      { label: 'OpsCanopy auf GitHub', href: 'https://github.com/opscanopy', external: true },
      { label: '@opscanopy auf X', href: 'https://twitter.com/opscanopy', external: true },
    ],
  },
};

export default de;
