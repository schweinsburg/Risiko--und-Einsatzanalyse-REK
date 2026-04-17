#!/bin/bash
# REK Daten-Update Shortcut
# Verwendung: ./update-data.sh [DATENTYP] [DATEI]
#
# Beispiele:
#   ./update-data.sh sonderobjekte neue_sonderobjekte.json
#   ./update-data.sh stations     neue_wachen.json
#   ./update-data.sh csv-brand    Einsatzdaten_REK.csv
#   ./update-data.sh build        (nur neu bauen)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_SCRIPT="$SCRIPT_DIR/build.py"

case "$1" in
  build)
    echo "═══ Build starten ═══"
    python3 "$BUILD_SCRIPT"
    ;;
  csv-brand)
    echo "═══ CSV Brandschutz importieren ═══"
    python3 "$BUILD_SCRIPT" --from-csv "$2" --csv-type brand
    ;;
  csv-rett)
    echo "═══ CSV Rettungsdienst importieren ═══"
    python3 "$BUILD_SCRIPT" --from-csv "$2" --csv-type rett
    ;;
  stations|rett_wachen|isochrones|kommunen|hiorg|sirenen|sonderobjekte|bombenfunde|bevoelkerung)
    echo "═══ $1 aktualisieren ═══"
    if [ -z "$2" ]; then
      echo "Fehler: Datei angeben! Beispiel: ./update-data.sh $1 neue_datei.json"
      exit 1
    fi
    cp "$2" "$PROJECT_DIR/data/$1.json"
    echo "  ✓ data/$1.json ersetzt"
    python3 "$BUILD_SCRIPT"
    ;;
  *)
    echo "REK Daten-Update"
    echo ""
    echo "Verwendung: ./update-data.sh [BEFEHL] [DATEI]"
    echo ""
    echo "Befehle:"
    echo "  build                          Nur neu bauen"
    echo "  csv-brand DATEI.csv            Brandschutz-Einsätze importieren"
    echo "  csv-rett  DATEI.csv            Rettungsdienst-Einsätze importieren"
    echo "  stations DATEI.json            Feuerwachen aktualisieren"
    echo "  rett_wachen DATEI.json         Rettungswachen aktualisieren"
    echo "  sonderobjekte DATEI.json       Sonderobjekte aktualisieren"
    echo "  sirenen DATEI.json             Sirenen aktualisieren"
    echo "  hiorg DATEI.json               HiOrg-Standorte aktualisieren"
    echo "  bombenfunde DATEI.json         Bombenfunde aktualisieren"
    echo "  isochrones DATEI.json          Isochronen aktualisieren"
    echo "  bevoelkerung DATEI.json        Bevölkerungsdaten aktualisieren"
    echo "  kommunen DATEI.json            Kommunen-Polygone aktualisieren"
    ;;
esac
