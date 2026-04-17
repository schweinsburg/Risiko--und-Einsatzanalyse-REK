/**
 * REK Data-Loader
 * Lädt alle Daten-JSONs und erstellt das globale DATA-Objekt.
 * Wird vor app.js geladen.
 */
(function(){
  // Liste aller Daten-Dateien
  var DATA_FILES = [
    'stations', 'incidents', 'isochrones', 'bevoelkerung',
    'kommunen', 'rett_wachen', 'hiorg', 'sirenen',
    'sonderobjekte', 'bombenfunde'
  ];

  // Globales DATA-Objekt initialisieren
  window.DATA = {
    stations: [], incidents: [], isochrones: {type:'FeatureCollection',features:[]},
    bevoelkerung: {cells:[]}, kommunen: {type:'FeatureCollection',features:[]},
    rett_wachen: [], hiorg: [], sirenen: [], sonderobjekte: [], bombenfunde: []
  };

  // Lade alle JSON-Dateien
  var loaded = 0;
  DATA_FILES.forEach(function(name){
    fetch('data/' + name + '.json')
      .then(function(r){ return r.json(); })
      .then(function(d){
        DATA[name] = d;
        loaded++;
        if(loaded === DATA_FILES.length){
          // Alle Daten geladen → Event feuern
          document.dispatchEvent(new Event('rek-data-loaded'));
        }
      })
      .catch(function(e){
        console.warn('Fehler beim Laden von data/' + name + '.json:', e);
        loaded++;
        if(loaded === DATA_FILES.length){
          document.dispatchEvent(new Event('rek-data-loaded'));
        }
      });
  });
})();
