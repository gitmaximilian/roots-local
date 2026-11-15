import { getLanguage } from "./locale";

export const LEGAL_URL = "https://maximilianauer.at/legal/";
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
  lead: "Roots Local runs entirely in your browser. Your DNA file is read and analyzed on this device. Nothing is uploaded, and nothing is sent to anyone.",
  sections: [
    {
      heading: "What happens to your files",
      body: [
        "When you open a file, your browser hands it to Roots Local directly. A background worker in this tab reads it piece by piece and analyzes it in memory. There is no server that could receive it: the app is a set of static files without any backend, API, or form.",
        "PDF reports and the medicine pass are created in your browser and saved with your browser's normal download. They are not sent anywhere either.",
        "When you close the tab or select Close session, the data is gone. Roots Local does not store DNA data, results, names, or exports in the browser: no cookies, no local storage of data, no database.",
      ],
    },
    {
      heading: "What the app remembers",
      body: [
        "Only your language choice is kept in this browser. After your first visit, your browser keeps the app's own program files so that it also works offline. These files contain no personal data.",
      ],
    },
    {
      heading: "How this is enforced",
      body: [
        "A strict Content Security Policy only allows the page to load its own files. Requests to any other address are blocked by your browser. Roots Local uses no external fonts, no analytics, no error tracking, and no content from other services.",
        "Automated tests load the app, import a synthetic DNA file, create both PDFs and the medicine pass, and fail if any network request happens after start-up. They also run the same steps offline.",
        "The hosting provider (Cloudflare Pages) records the usual access data that every web server logs when the app's files are downloaded, such as IP address, time, and browser. It never sees your DNA file.",
      ],
    },
    {
      heading: "Medical limits",
      body: [
        "Roots Local is not a diagnosis. Consumer DNA tests can be wrong. Medically relevant findings need confirmation in a certified laboratory and should be discussed with a physician.",
      ],
    },
  ],
  checkTitle: "Check it yourself",
  check: [
    "Open your browser's developer tools and select the Network tab.",
    "Reload Roots Local and wait until it has started. Then clear the list.",
    "Open your DNA file, browse the results, and export a PDF. The list stays empty.",
    "Or switch your device to airplane mode after the first visit. Roots Local keeps working, including PDF export.",
    "Each release lists the checksum of every file in SHA256SUMS, so you can compare the live app with a build of the public source code.",
  ],
  legal: "Legal notice and privacy policy",
  source: "Source code",
};

const de: Copy = {
  title: "Datenschutz",
  lead: "Roots Local läuft vollständig in deinem Browser. Deine DNA-Datei wird auf diesem Gerät gelesen und ausgewertet. Nichts wird hochgeladen und nichts wird an irgendwen gesendet.",
  sections: [
    {
      heading: "Was mit deinen Dateien passiert",
      body: [
        "Wenn du eine Datei öffnest, übergibt dein Browser sie direkt an Roots Local. Ein Hintergrundprozess in diesem Tab liest sie stückweise und wertet sie im Arbeitsspeicher aus. Es gibt keinen Server, der sie empfangen könnte: Die App besteht aus statischen Dateien ohne Backend, API oder Formular.",
        "PDF-Reports und der Medikamentenpass entstehen in deinem Browser und werden über den normalen Download gespeichert. Auch sie werden nirgendwohin gesendet.",
        "Wenn du den Tab schließt oder „Sitzung schließen“ wählst, sind die Daten weg. Roots Local speichert keine DNA-Daten, Ergebnisse, Namen oder Exporte im Browser: keine Cookies, kein lokaler Datenspeicher, keine Datenbank.",
      ],
    },
    {
      heading: "Was sich die App merkt",
      body: [
        "Nur deine Sprachwahl bleibt in diesem Browser gespeichert. Nach dem ersten Besuch behält dein Browser die Programmdateien der App, damit sie auch offline funktioniert. Diese Dateien enthalten keine persönlichen Daten.",
      ],
    },
    {
      heading: "Wie das erzwungen wird",
      body: [
        "Eine strenge Content Security Policy erlaubt der Seite nur, ihre eigenen Dateien zu laden. Anfragen an andere Adressen blockiert dein Browser. Roots Local verwendet keine externen Schriften, keine Statistik, kein Fehler-Tracking und keine Inhalte anderer Dienste.",
        "Automatische Tests laden die App, importieren eine synthetische DNA-Datei, erstellen beide PDFs und den Medikamentenpass und schlagen fehl, sobald nach dem Start irgendeine Netzwerkanfrage entsteht. Dieselben Schritte laufen auch offline.",
        "Der Hosting-Anbieter (Cloudflare Pages) protokolliert beim Abruf der Programmdateien die üblichen Zugriffsdaten, die jeder Webserver erfasst, etwa IP-Adresse, Zeitpunkt und Browser. Deine DNA-Datei sieht er nie.",
      ],
    },
    {
      heading: "Medizinische Grenzen",
      body: [
        "Roots Local ersetzt keine Diagnose. Verbraucher-DNA-Tests können sich irren. Medizinisch relevante Befunde müssen in einem zertifizierten Labor bestätigt und mit einer Ärztin oder einem Arzt besprochen werden.",
      ],
    },
  ],
  checkTitle: "Selbst prüfen",
  check: [
    "Öffne die Entwicklerwerkzeuge deines Browsers und wähle den Tab „Netzwerk“.",
    "Lade Roots Local neu und warte, bis die App gestartet ist. Leere dann die Liste.",
    "Öffne deine DNA-Datei, sieh dir die Ergebnisse an und exportiere ein PDF. Die Liste bleibt leer.",
    "Oder schalte dein Gerät nach dem ersten Besuch in den Flugmodus. Roots Local funktioniert weiter, auch der PDF-Export.",
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
