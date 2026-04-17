# Risiko- und Einsatzanalyse REK

Interaktive Karte für das Amt 38 – Rettungsdienst, Brand- und Bevölkerungsschutz des Rhein-Erft-Kreises.

## Ordnerstruktur

```
rek-projekt/
├── index.html              ← HTML-Gerüst (für Entwicklung mit data-loader.js)
├── css/
│   └── style.css           ← Alle CSS-Styles
├── js/
│   ├── data-loader.js      ← Lädt JSON-Dateien dynamisch (Entwicklungsmodus)
│   └── app.js              ← Gesamte Anwendungslogik (~183 KB)
├── data/
│   ├── stations.json       ← 59 Feuerwachen (5 KB)
│   ├── rett_wachen.json    ← 31 Rettungswachen (8 KB)
│   ├── isochrones.json     ← Brandschutz-Isochronen LKW+PKW (7,6 MB)
│   ├── bevoelkerung.json   ← Zensus-Rasterdaten 2022 (1,7 MB)
│   ├── kommunen.json       ← 10 Kommunen-Polygone (147 KB)
│   ├── hiorg.json          ← 12 HiOrg-Standorte (2 KB)
│   ├── sirenen.json        ← 159 Sirenen (36 KB)
│   ├── sonderobjekte.json  ← 213 Sonderobjekte (69 KB)
│   ├── bombenfunde.json    ← 47 Bombenfunde (7 KB)
│   └── incidents.json      ← Einsätze (leer, per Upload befüllt)
├── build/
│   ├── build.py            ← Build-Script (Python 3)
│   └── update-data.sh      ← Admin-Shortcut für Daten-Updates
└── dist/
    └── index.html          ← Gebaute Single-File-HTML (~9,5 MB)
```

## Für Entwickler / Lokaler Betrieb

Die `index.html` im Root lädt die Daten dynamisch per `fetch()` aus dem `data/`-Ordner.
Ein lokaler Webserver ist nötig (wegen CORS):

```bash
# Python
cd rek-projekt
python3 -m http.server 8000

# Node.js
npx serve .
```

Dann öffnen: http://localhost:8000

## Für GitHub Pages (Deployment)

GitHub Pages benötigt eine Single-File-HTML. Das Build-Script erzeugt diese:

```bash
python3 build/build.py
```

Ergebnis: `dist/index.html` (~9,5 MB) — diese Datei ins GitHub-Repository kopieren.

## Admin: Daten aktualisieren

### Einzelne Daten-Datei ersetzen

```bash
# Beispiel: Neue Sonderobjekte-Daten
python3 build/build.py --update sonderobjekte --update-file neue_sonderobjekte.json
```

### CSV importieren

```bash
# Brandschutz-Einsätze
python3 build/build.py --from-csv Einsatzdaten_REK_2023-2025.csv --csv-type brand

# Rettungsdienst-Einsätze
python3 build/build.py --from-csv Einsatzdaten_Rett.csv --csv-type rett
```

### Nur Daten aktualisieren (ohne neu zu bauen)

```bash
python3 build/build.py --update stations --update-file neue_wachen.json --no-build
```

### Workflow: Daten-Update + Deploy

```bash
# 1. Daten-Datei ersetzen (z.B. neue Sonderobjekte)
cp neue_sonderobjekte.json data/sonderobjekte.json

# 2. Single-File-HTML neu bauen
python3 build/build.py

# 3. Ins GitHub-Repo kopieren und pushen
cp dist/index.html /pfad/zum/github-repo/index.html
cd /pfad/zum/github-repo
git add index.html
git commit -m "Daten-Update: Sonderobjekte aktualisiert"
git push
```

## Datenformate

### stations.json / rett_wachen.json
Array von Objekten mit: `name`, `kurz`, `lat`, `lon`, `stadt`, `stadtteil`, etc.

### isochrones.json
GeoJSON FeatureCollection mit vorberechneten Isochronen-Polygonen.

### bevoelkerung.json
Objekt mit `cells`-Array: `[[lat, lon, einwohner], ...]` (Zensus-Rasterzellen 100m).

### sonderobjekte.json
Array mit: `name`, `lat`, `lon`, `kat` (Kategorie), etc.

### incidents.json (leer im Template)
Wird zur Laufzeit per CSV-Upload befüllt (Datenschutz: nicht in GitHub).
