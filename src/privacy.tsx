import { getLanguage } from "./locale";

export const LEGAL_URL = "https://maximilianauer.at/legal/#rootslocal";
export const SOURCE_URL = "https://github.com/gitmaximilian/roots-local";

type Copy = {
  title: string;
  lead: string;
  sections: { heading: string; body: string[] }[];
  checkTitle: string;
  check: string[];
  legal: string;
  source: string;
};

const en: Copy = {
  title: "Privacy",
  lead: "Roots Local reads and analyzes your DNA file on this device. Your files, names and results stay in your browser session.",
  sections: [
    {
      heading: "What happens to your files",
      body: [
        "When you open a file, your browser hands it to Roots Local directly. A background worker in this tab reads it piece by piece and analyzes it in memory. There is no server that could receive it: the app is a set of static files without any backend, API, or form.",
        "PDF reports and the medicine pass are created in your browser and saved with your browser's normal download. They are not sent anywhere either.",
        "Closing the tab or selecting Close session clears the analysis from the app. Downloaded exports remain on your device until you delete them. Your device settings determine whether your downloads folder is synced.",
      ],
    },
    {
      heading: "What the app remembers",
      body: [
        "Your browser stores your language choice and caches the app's program files for offline use. You can clear both in your browser's site settings.",
      ],
    },
    {
      heading: "How this is enforced",
      body: [
        "The Content Security Policy allows workers to load program files from this site. The page itself cannot open network connections to send data. Roots Local has no account, cookies, analytics, or advertising.",
        "Browser tests import a synthetic DNA file, open the results, and export both reports and the medicine pass. They check for network requests after start-up and repeat the workflow offline.",
        "Cloudflare Pages processes technical connection data when it serves the app files, such as IP address, time, browser and requested path. Depending on the host, your browser may send Cloudflare reports about failed connections. See the legal notice for details.",
      ],
    },
    {
      heading: "Medical limits",
      body: [
        "Roots Local does not replace a diagnosis or guide medication choices or doses. Medically relevant results from consumer DNA tests require laboratory confirmation and medical interpretation.",
      ],
    },
  ],
  checkTitle: "Check it yourself",
  check: [
    "Open your browser's developer tools and select the Network tab.",
    "Reload Roots Local and wait until it has started. Then clear the list.",
    "Open your DNA file, browse the results, and export a PDF. The list stays empty.",
    "Once your browser has cached the app, switch your device to airplane mode and try importing a file and exporting a PDF.",
    "Each release lists the checksum of every file in SHA256SUMS, so you can compare the live app with a build of the public source code.",
  ],
  legal: "Legal notice and privacy policy",
  source: "Source code",
};

const de: Copy = {
  title: "Datenschutz",
  lead: "Roots Local liest und analysiert deine DNA-Datei auf diesem Gerät. Deine Dateien, Namen und Ergebnisse bleiben in deiner Browser-Sitzung.",
  sections: [
    {
      heading: "Was mit deinen Dateien passiert",
      body: [
        "Wenn du eine Datei öffnest, übergibt dein Browser sie direkt an Roots Local. Ein Hintergrundprozess in diesem Tab liest sie stückweise und wertet sie im Arbeitsspeicher aus. Es gibt keinen Server, der sie empfangen könnte: Die App besteht aus statischen Dateien ohne Backend, API oder Formular.",
        "PDF-Reports und der Medikamentenpass entstehen in deinem Browser und werden über den normalen Download gespeichert. Auch sie werden nirgendwohin gesendet.",
        "Wenn du den Tab schließt oder „Sitzung schließen“ wählst, wird die Analyse aus der App entfernt. Heruntergeladene Exporte bleiben auf deinem Gerät, bis du sie löschst. Deine Geräteeinstellungen bestimmen, ob der Download-Ordner synchronisiert wird.",
      ],
    },
    {
      heading: "Was sich die App merkt",
      body: [
        "Dein Browser speichert deine Sprachwahl und hält die Programmdateien der App für die Offline-Nutzung im Cache bereit. Beides kannst du in den Website-Daten deines Browsers löschen.",
      ],
    },
    {
      heading: "Wie das erzwungen wird",
      body: [
        "Die Content Security Policy erlaubt Hintergrundprozessen, Programmdateien von dieser Website zu laden. Die Seite selbst kann keine Netzwerkverbindung zum Senden von Daten öffnen. Roots Local hat kein Konto und verwendet keine Cookies, Analyse- oder Werbedienste.",
        "Browsertests importieren eine synthetische DNA-Datei, öffnen die Ergebnisse und exportieren beide Reports und den Medikamentenpass. Sie prüfen Netzwerkanfragen nach dem Start und wiederholen den Ablauf offline.",
        "Cloudflare Pages verarbeitet beim Abruf der Programmdateien technische Verbindungsdaten, etwa IP-Adresse, Zeitpunkt, Browser und angefragten Pfad. Je nach Host kann dein Browser Cloudflare technische Fehlermeldungen senden. Details stehen in der Datenschutzerklärung.",
      ],
    },
    {
      heading: "Medizinische Grenzen",
      body: [
        "Roots Local ersetzt keine Diagnose und dient nicht als Grundlage für die Auswahl oder Dosierung eines Arzneimittels. Medizinisch relevante Ergebnisse aus Verbraucher-DNA-Tests müssen durch eine Laboruntersuchung bestätigt und ärztlich eingeordnet werden.",
      ],
    },
  ],
  checkTitle: "Selbst prüfen",
  check: [
    "Öffne die Entwicklerwerkzeuge deines Browsers und wähle den Tab „Netzwerk“.",
    "Lade Roots Local neu und warte, bis die App gestartet ist. Leere dann die Liste.",
    "Öffne deine DNA-Datei, sieh dir die Ergebnisse an und exportiere ein PDF. Die Liste bleibt leer.",
    "Sobald dein Browser die App im Cache hat, schalte in den Flugmodus und versuche, eine Datei zu öffnen und ein PDF zu exportieren.",
    "Jede Version listet in SHA256SUMS die Prüfsumme jeder Datei. So kannst du die Live-App mit einem Build des öffentlichen Quellcodes vergleichen.",
  ],
  legal: "Impressum und Datenschutzerklärung",
  source: "Quellcode",
};

export function Privacy() {
  const copy = getLanguage() === "de" ? de : en;
  return (
    <article className="privacy">
      <header className="heading">
        <h1>{copy.title}</h1>
        <p>{copy.lead}</p>
      </header>
      {copy.sections.map((section) => (
        <section className="panel" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section className="panel">
        <h2>{copy.checkTitle}</h2>
        <ol>
          {copy.check.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <p className="privacy-links">
        <a href={LEGAL_URL} target="_blank" rel="noopener noreferrer">
          {copy.legal}
        </a>
        <span aria-hidden="true"> · </span>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          {copy.source}
        </a>
        <span aria-hidden="true"> · </span>
        <a href="/SHA256SUMS" target="_blank" rel="noopener">
          SHA256SUMS
        </a>
      </p>
    </article>
  );
}
