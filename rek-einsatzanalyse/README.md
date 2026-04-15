# Risiko- und Einsatzanalyse REK

Interaktive Karte für die Risiko- und Einsatzanalyse des Rhein-Erft-Kreises.  
Erstellt durch: Amt 38/2 – Brand- und Bevölkerungsschutz

## Nutzung

### Online (GitHub Pages)
Die Karte ist unter folgender Adresse erreichbar:  
`https://DEIN-GITHUB-NAME.github.io/rek-einsatzanalyse/`

### Lokal (ohne Internet)
Die Datei `index.html` kann direkt im Browser geöffnet werden.  
Hierfür muss ein lokaler Webserver gestartet werden:

```bash
# Python (meist vorinstalliert)
python -m http.server 8080
# → http://localhost:8080
```

## Einsatzdaten laden

Beim Start erscheint ein Upload-Dialog.  
Unterstützte Formate: `.xlsx`, `.xls`, `.csv`

**Erforderliche Spalten:**
| Spaltenname | Beschreibung |
|---|---|
| Latitude | Breitengrad (dezimal) |
| Longitude | Längengrad (dezimal) |
| Einsatz-Nr. | Einsatznummer |
| Ort | Gemeinde |
| Stadtteil | Ortsteil (optional) |
| Adresse | Straße |
| Haus-Nr. | Hausnummer (optional) |
| Stichwort | Einsatzstichwort |
| Datum | Datum (TT.MM.JJJJ) |

Die Daten werden **ausschließlich lokal** im Browser verarbeitet.  
Es erfolgt keine Übertragung an externe Server.

## Dateistruktur

```
rek-einsatzanalyse/
├── index.html          ← Hauptseite mit Upload-Dialog
├── css/
│   └── karte.css       ← Styles
├── js/
│   └── karte.js        ← Kartenlogik
├── data/
│   ├── isochrones.json ← Isochronen (2–16 Min, PKW + LKW)
│   └── wachen.json     ← Wachen-Standorte REK
└── README.md
```

## Jährliches Update der Einsatzdaten

Neue Einsatzdaten aus dem ELS exportieren (Excel/CSV) und beim Start in die Karte laden.  
Die Isochronen- und Wachen-Daten im `data/`-Ordner bleiben unverändert.

## Technologie

- [Leaflet](https://leafletjs.com/) – Kartenframework
- [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) – Marker-Clustering
- [SheetJS](https://sheetjs.com/) – Excel-Verarbeitung
- [Turf.js](https://turfjs.org/) – Geodaten-Analyse
- Basiskarten: OpenStreetMap, basemap.de (GeoBasis-DE / BKG)
- Routing: OSRM (online) / Isochronen (offline)

## Lizenz

Interne Nutzung Rhein-Erft-Kreis.  
Kartendaten: © OpenStreetMap-Mitwirkende | © GeoBasis-DE / BKG (2024) CC BY 4.0
