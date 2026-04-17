#!/usr/bin/env python3
"""
REK Build-Script
================
Baut die Single-File-HTML (index.html) aus der Ordnerstruktur.

Nutzung:
  python3 build.py                     # Standard-Build
  python3 build.py --update stations   # Nur stations.json aktualisieren
  python3 build.py --from-csv Einsatzdaten_REK.csv  # CSV importieren

Das Script liest:
  - index-template.html (HTML-Gerüst)
  - css/style.css
  - js/app.js
  - data/*.json (alle Daten-Dateien)

Und erzeugt:
  - dist/index.html (Single-File, ~10 MB, für GitHub Pages)
"""

import os
import re
import json
import sys
import argparse
from datetime import datetime


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)  # eine Ebene hoch
DATA_DIR = os.path.join(PROJECT_DIR, 'data')
CSS_DIR = os.path.join(PROJECT_DIR, 'css')
JS_DIR = os.path.join(PROJECT_DIR, 'js')
DIST_DIR = os.path.join(PROJECT_DIR, 'dist')

# Daten-Dateien und ihre Reihenfolge
DATA_FILES = [
    'stations', 'incidents', 'isochrones', 'bevoelkerung',
    'kommunen', 'rett_wachen', 'hiorg', 'sirenen',
    'sonderobjekte', 'bombenfunde'
]


def load_data():
    """Lädt alle JSON-Dateien und gibt ein DATA-Dict zurück."""
    data = {}
    for name in DATA_FILES:
        path = os.path.join(DATA_DIR, f'{name}.json')
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                data[name] = json.load(f)
            size = os.path.getsize(path)
            print(f'  ✓ {name}.json ({size:,} bytes)')
        else:
            print(f'  ✗ {name}.json FEHLT')
            data[name] = [] if name not in ('isochrones','kommunen','bevoelkerung') else {}
    return data


def load_css():
    """Lädt alle CSS-Dateien."""
    css_path = os.path.join(CSS_DIR, 'style.css')
    if os.path.exists(css_path):
        with open(css_path, 'r', encoding='utf-8') as f:
            return f.read()
    return ''


def load_js():
    """Lädt die Haupt-JS-Datei."""
    js_path = os.path.join(JS_DIR, 'app.js')
    if os.path.exists(js_path):
        with open(js_path, 'r', encoding='utf-8') as f:
            return f.read()
    return ''


def build_single_file(data, css, js):
    """Baut die Single-File-HTML."""
    # Lade HTML-Template
    template_path = os.path.join(PROJECT_DIR, 'index.html')
    with open(template_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # DATA als JSON-String
    data_json = json.dumps(data, ensure_ascii=False, separators=(',', ':'))

    # CSS: link → inline style
    html = html.replace(
        '<link rel="stylesheet" href="css/style.css">',
        f'<style>\n{css}\n</style>'
    )

    # JS: externe Scripts → inline mit DATA
    js_block = f'<script>\nvar DATA = {data_json};\n{js}\n</script>'
    # Finde und ersetze die Script-Tags (kein re.sub wegen Unicode-Escapes im JS)
    pattern_str = '<script src="js/data-loader.js"></script>\n<script src="js/app.js"></script>'
    html = html.replace(pattern_str, js_block)

    return html


def update_data_file(name, new_data):
    """Aktualisiert eine einzelne Daten-Datei."""
    path = os.path.join(DATA_DIR, f'{name}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'  ✓ {name}.json aktualisiert ({os.path.getsize(path):,} bytes)')


def import_csv(csv_path, data_type='brand'):
    """Importiert eine CSV-Datei und gibt geparste Daten zurück."""
    import csv
    
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        rows = list(reader)
    
    print(f'  CSV gelesen: {len(rows)} Zeilen')
    
    if data_type in ('brand', 'rett'):
        parsed = []
        for r in rows:
            lat_raw = r.get('Latitude', '')
            lon_raw = r.get('Longitude', '')
            try:
                lat = float(lat_raw.replace(',', '.').replace('.', '', lat_raw.count('.') - 1) if ',' in lat_raw else lat_raw)
                lon = float(lon_raw.replace(',', '.').replace('.', '', lon_raw.count('.') - 1) if ',' in lon_raw else lon_raw)
            except (ValueError, AttributeError):
                continue
            
            # Bereich-Check REK
            if not (50.5 < lat < 51.2 and 6.3 < lon < 7.2):
                continue
            
            datum = r.get('Datum', '')
            parts = datum.split('.')
            year = int(parts[2]) if len(parts) >= 3 else 0
            
            parsed.append({
                'lat': lat, 'lon': lon,
                'nr': r.get('Einsatz-Nr.', ''),
                'ort': r.get('Ort', ''),
                'st': r.get('Stadtteil', ''),
                'ad': r.get('Adresse', ''),
                'hn': r.get('Haus-Nr.', ''),
                'sw': r.get('Stichwort', ''),
                'dt': datum,
                'yr': year,
                'mo': r.get('Monat', ''),
                'ob': r.get('Objektname', '')
            })
        
        print(f'  Geparst: {len(parsed)} Einsätze')
        return parsed
    
    return rows


def main():
    parser = argparse.ArgumentParser(description='REK Build-Script')
    parser.add_argument('--update', help='Einzelne Daten-Datei aktualisieren (z.B. stations)')
    parser.add_argument('--update-file', help='Pfad zur neuen JSON-Datei')
    parser.add_argument('--from-csv', help='CSV-Datei importieren')
    parser.add_argument('--csv-type', default='brand', choices=['brand', 'rett', 'hf'],
                        help='Typ der CSV (brand/rett/hf)')
    parser.add_argument('--no-build', action='store_true', help='Nur Daten aktualisieren, nicht bauen')
    parser.add_argument('--output', default=None, help='Output-Pfad (Standard: dist/index.html)')
    args = parser.parse_args()

    print(f'═══ REK Build-Script ═══')
    print(f'Projekt: {PROJECT_DIR}')
    print(f'Datum:   {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    print()

    # Update einzelne Datei
    if args.update and args.update_file:
        with open(args.update_file, 'r', encoding='utf-8') as f:
            new_data = json.load(f)
        update_data_file(args.update, new_data)
        if args.no_build:
            return

    # CSV importieren
    if args.from_csv:
        parsed = import_csv(args.from_csv, args.csv_type)
        name = 'incidents' if args.csv_type == 'brand' else f'incidents_{args.csv_type}'
        update_data_file(name, parsed)
        if args.no_build:
            return

    # Build
    print('Lade Daten...')
    data = load_data()

    print('\nLade CSS...')
    css = load_css()
    print(f'  {len(css):,} bytes')

    print('\nLade JavaScript...')
    js = load_js()
    print(f'  {len(js):,} bytes')

    print('\nBaue Single-File-HTML...')
    html = build_single_file(data, css, js)

    # Output
    os.makedirs(DIST_DIR, exist_ok=True)
    output_path = args.output or os.path.join(DIST_DIR, 'index.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    size = os.path.getsize(output_path)
    print(f'\n✓ Fertig: {output_path}')
    print(f'  Größe: {size:,} bytes ({size/1024/1024:.1f} MB)')


if __name__ == '__main__':
    main()
