// ── Supabase Konfiguration ────────────────────────────────────────────────
const SUPA_URL = 'https://otltqzxtkpnrqvggacxg.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90bHRxenh0a3BucnF2Z2dhY3hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyOTA0NTgsImV4cCI6MjA5MTg2NjQ1OH0.WAyiYTBKwrjCOP_Dn6viLTLzo4_Zq8agZGq5i0Qf9Kc';

// Supabase JS SDK DEAKTIVIERT - Daten sind direkt in der HTML eingebettet
// (function(){
//   var s = document.createElement('script');
//   s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
//   s.onload = function(){ supabaseInit(); };
//   document.head.appendChild(s);
// })();

var supaClient = null;

function supabaseInit(){
  // deaktiviert - kein Supabase mehr
}

function loginSubmit(){
  var email = document.getElementById('login-email').value.trim();
  var pw    = document.getElementById('login-pw').value;
  var btn   = document.getElementById('login-btn');
  var err   = document.getElementById('login-error');
  var st    = document.getElementById('login-status');

  if(!email || !pw){ err.textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Anmelden...';
  st.textContent = '';

  supaClient.auth.signInWithPassword({ email: email, password: pw })
    .then(function(result){
      if(result.error){
        err.textContent = 'Anmeldung fehlgeschlagen: ' + result.error.message;
        btn.disabled = false;
        btn.textContent = 'Anmelden';
      } else {
        st.textContent = 'Angemeldet – Einsatzdaten werden geladen...';
        ladeEinsaetzeVonSupabase();
      }
    });
}

function ladeEinsaetzeVonSupabase(){
  var st = document.getElementById('login-status');
  if(st) st.textContent = 'Einsatzdaten werden geladen...';

  // Alle Einsätze in Batches laden (Supabase max 1000 pro Anfrage)
  var alleEinsaetze = [];
  var batchSize = 1000;
  var from = 0;

  function ladeBatch(){
    supaClient
      .from('einsaetze')
      .select('lat,lon,nr,ort,st,ad,hn,sw,dt,yr,mo,ob')
      .range(from, from + batchSize - 1)
      .then(function(result){
        if(result.error){
          console.error('[Supabase]', result.error);
          // Fallback: Upload-Dialog zeigen
          document.getElementById('login-overlay').style.display = 'none';
          document.getElementById('upload-overlay').style.display = 'flex';
          return;
        }
        var rows = result.data || [];
        alleEinsaetze = alleEinsaetze.concat(rows);
        if(rows.length === batchSize){
          // Noch mehr Daten vorhanden
          from += batchSize;
          if(st) st.textContent = alleEinsaetze.length + ' Einsätze geladen...';
          ladeBatch();
        } else {
          // Fertig
          DATA.incidents = alleEinsaetze;
          if(st) st.textContent = alleEinsaetze.length + ' Einsätze geladen ✓';
          setTimeout(function(){
            document.getElementById('login-overlay').style.display = 'none';
            if(typeof window._reloadEinsaetze === 'function') window._reloadEinsaetze();
          }, 600);
        }
      });
  }

  ladeBatch();
}

// Logout-Funktion (für später)
function supaLogout(){
  if(supaClient) supaClient.auth.signOut().then(function(){
    location.reload();
  });
}

// SheetJS fuer Excel-Verarbeitung
(function(){var s=document.createElement('script');s.src='https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';document.head.appendChild(s);})();

function uplProg(p){var w=document.getElementById('upl-prog-wrap'),f=document.getElementById('upl-prog-fill');if(w)w.style.display='block';if(f)f.style.width=p+'%';}
function uplSt(m,c){var e=document.getElementById('upl-status');if(e){e.textContent=m;e.style.color=c||'#888';}}
function uplDrop(e){e.preventDefault();document.getElementById('drop-zone').classList.remove('drag-over');if(e.dataTransfer.files[0])uplFile(e.dataTransfer.files[0]);}
function uplOhne(){document.getElementById('upload-overlay').style.display='none';}

function uplFile(file){
  if(!file)return;
  var ext=file.name.split('.').pop().toLowerCase();
  if(!['xlsx','xls','csv'].includes(ext)){uplSt('Bitte .xlsx, .xls oder .csv.','#c0392b');return;}
  uplSt('Datei wird gelesen\u2026');uplProg(20);
  var r=new FileReader();
  r.onload=function(ev){
    uplProg(50);uplSt('Eins\u00e4tze werden verarbeitet\u2026');
    setTimeout(function(){
      try{
        var inc;
        if(ext==='csv'){
          inc=uplParseCSV(ev.target.result);
        } else {
          if(typeof XLSX==='undefined'){uplSt('Kurz warten\u2026','#e67e22');setTimeout(function(){uplFile(file);},1200);return;}
          var wb=XLSX.read(ev.target.result,{type:'array'});
          inc=uplParseRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}));
        }
        DATA.incidents=inc;
        uplProg(90);uplSt(inc.length+' Eins\u00e4tze geladen','#276749');
        setTimeout(function(){
          uplProg(100);
          setTimeout(function(){
            document.getElementById('upload-overlay').style.display='none';
            // Einsatz-relevante Layer neu aufbauen
            if(typeof window._reloadEinsaetze==='function') window._reloadEinsaetze();
          },500);
        },200);
      }catch(err){uplSt('Fehler: '+err.message,'#c0392b');uplProg(0);console.error(err);}
    },50);
  };
  if(ext==='csv')r.readAsText(file,'UTF-8');else r.readAsArrayBuffer(file);
}
// Robuster Koordinaten-Parser:
// Akzeptiert "50.87330623", "50,87330623", "5.087.330.623" (Tausenderpunkte-Bug),
// "50873306" (ohne Punkt, wissenschaftlich formatiert) etc.
// Erwartet Werte im Bereich lat 47-55 (DE), lon 5-15 (DE)
function uplParseCoord(raw, isLat){
  if(raw===null||raw===undefined||raw==='')return NaN;
  var s=String(raw).trim();
  if(!s)return NaN;
  // Komma zu Punkt (deutsche Dezimalschreibweise)
  s=s.replace(',','.');
  // Standardversuch
  var n=parseFloat(s);
  if(!isNaN(n)){
    // Wenn nur ein Punkt im String und parseFloat einen plausiblen Wert liefert: OK
    var dots=(s.match(/\./g)||[]).length;
    if(dots<=1 && ((isLat && n>=47 && n<=55) || (!isLat && n>=5 && n<=15))) return n;
  }
  // Fallback: alle Punkte entfernen, Ziffern extrahieren
  var digits=s.replace(/[^0-9-]/g,'');
  if(!digits||digits==='-')return NaN;
  var neg=digits.charAt(0)==='-';
  if(neg)digits=digits.substring(1);
  if(!digits)return NaN;
  // Zielbereich: lat ~50.x (2 Vorkommastellen), lon ~6.x (1 Vorkommastelle)
  // Wir versuchen, den Dezimalpunkt so zu setzen, dass das Ergebnis im plausiblen Bereich liegt
  var min = isLat ? 47 : 5;
  var max = isLat ? 55 : 15;
  for(var cut=1; cut<=3; cut++){
    if(digits.length<=cut)continue;
    var v=parseFloat(digits.substring(0,cut)+'.'+digits.substring(cut));
    if(!isNaN(v) && v>=min && v<=max) return neg?-v:v;
  }
  return NaN;
}
function uplParseRows(rows){
  if(!rows.length)return[];
  var cols=Object.keys(rows[0]);
  function fc(ks){for(var k of ks){var f=cols.find(function(c){return c.toLowerCase().includes(k.toLowerCase());});if(f)return f;}return null;}
  var cLat=fc(['latitude','lat','breite']),cLon=fc(['longitude','lon','l\u00e4nge']);
  var cNr=fc(['einsatz-nr','nr.','nr','nummer']),cOrt=fc(['ort','stadt','gemeinde']);
  var cSt=fc(['stadtteil','ortsteil']),cAd=fc(['adresse','stra\u00dfe']);
  var cHn=fc(['haus-nr','hausnummer']),cSw=fc(['stichwort','einsatzart']);
  var cDt=fc(['datum','date']),cOb=fc(['objekt']);
  var mon=['','Jan','Feb','M\u00e4r','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  return rows.map(function(row){
    var lat=uplParseCoord(row[cLat],true),lon=uplParseCoord(row[cLon],false);
    if(isNaN(lat)||isNaN(lon))return null;
    var dt=String(row[cDt]||''),p=dt.split('.');
    return{lat:lat,lon:lon,nr:String(row[cNr]||''),ort:String(row[cOrt]||''),
      st:String(row[cSt]||''),ad:String(row[cAd]||''),hn:String(row[cHn]||''),
      sw:String(row[cSw]||'').toUpperCase(),dt:dt,
      yr:p.length>=3?parseInt(p[2]):new Date().getFullYear(),
      mo:p.length>=2?(mon[parseInt(p[1])]||''):'',ob:String(row[cOb]||'')};
  }).filter(Boolean);
}
function uplParseCSV(text){
  var lines=text.split('\n').filter(Boolean),sep=lines[0].includes(';')?';':',';
  var hdr=lines[0].split(sep).map(function(h){return h.trim().replace(/^"|"$/g,'');});
  return uplParseRows(lines.slice(1).map(function(l){
    var v=l.split(sep).map(function(x){return x.trim().replace(/^"|"$/g,'');});
    var o={};hdr.forEach(function(h,i){o[h]=v[i]||'';});return o;
  }));
}

const $=id=>document.getElementById(id);

// Tab-Leiste: Brandschutz / Rettungsdienst / Katastrophenschutz
function switchTab(key){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.tab===key);
  });
  document.querySelectorAll('.tab-panel').forEach(p=>{
    p.classList.toggle('active',p.id==='panel-'+key);
  });
  // Beim Wechsel auf Datenverwaltung: Status neu berechnen
  if(key==='daten' && typeof updateStatusTable==='function') updateStatusTable();
  // Leaflet braucht einen Redraw nachdem die Sidebar-Breite sich effektiv ändern könnte
  setTimeout(()=>{if(window.map)map.invalidateSize();},50);
}

// Status-Tabelle in der Datenverwaltung aktualisieren
function updateStatusTable(){
  function setStat(id, text, state){
    var el=document.getElementById(id); if(!el)return;
    var color = state==='green' ? 'stat-green' : state==='yellow' ? 'stat-yellow' : state==='red' ? 'stat-red' : 'stat-gray';
    el.innerHTML = '<span class="stat-dot '+color+'"></span>'+text;
  }
  function fmtNumStatus(n){ return (n||0).toLocaleString('de-DE'); }
  window.updateDatenStatus = function(){
  // Einsätze Brandschutz
  var nEins = (DATA && DATA.incidents) ? DATA.incidents.length : 0;
  setStat('stat-eins-brand', nEins ? fmtNumStatus(nEins)+' Einsätze geladen' : 'nicht geladen', nEins ? 'green' : 'gray');
  // Einsätze Rettungsdienst
  var nRett = (DATA && DATA.incidents_rett) ? DATA.incidents_rett.length : 0;
  setStat('stat-eins-rett', nRett ? fmtNumStatus(nRett)+' Einsätze geladen' : 'nicht geladen', nRett ? 'green' : 'gray');
  // Hilfsfrist
  var nHF = (DATA && DATA.hilfsfristen) ? DATA.hilfsfristen.length : 0;
  setStat('stat-hf', nHF ? fmtNumStatus(nHF)+' Datensätze' : 'nicht geladen', nHF ? 'green' : 'gray');
  // Bombenfund
  var nBomb = (DATA && DATA.bombenfunde) ? DATA.bombenfunde.length : 0;
  setStat('stat-bomb', nBomb ? fmtNumStatus(nBomb)+' Funde' : 'nicht geladen', nBomb ? 'green' : 'gray');
  // Wachen (Feuerwehr)
  var nWachen = (DATA && DATA.stations) ? DATA.stations.length : 0;
  setStat('stat-wachen', nWachen ? fmtNumStatus(nWachen)+' Standorte (eingebettet)' : 'nicht geladen', nWachen ? 'green' : 'gray');
  // Rettungswachen
  var nRW = (DATA && DATA.rett_wachen) ? DATA.rett_wachen.length : 0;
  setStat('stat-rett-wachen', nRW ? fmtNumStatus(nRW)+' Rettungswachen (eingebettet)' : 'nicht geladen', nRW ? 'green' : 'gray');
  // HiOrg/EE NRW
  var nHiorg = (DATA && DATA.hiorg) ? DATA.hiorg.length : 0;
  setStat('stat-hiorg', nHiorg ? fmtNumStatus(nHiorg)+' Standorte (eingebettet)' : 'nicht geladen', nHiorg ? 'green' : 'gray');
  // Sirenen
  var nSir = (DATA && DATA.sirenen) ? DATA.sirenen.length : 0;
  setStat('stat-sirenen', nSir ? fmtNumStatus(nSir)+' Sirenen (eingebettet)' : 'nicht geladen', nSir ? 'green' : 'gray');
  // Sonderobjekte
  var nSO = (DATA && DATA.sonderobjekte) ? DATA.sonderobjekte.length : 0;
  setStat('stat-sobj', nSO ? fmtNumStatus(nSO)+' Objekte (eingebettet)' : 'nicht geladen', nSO ? 'green' : 'gray');
  // ORS API-Key
  var ors='';
  try{ ors = localStorage.getItem('ors_api_key')||''; }catch(e){}
  setStat('stat-ors', ors ? 'hinterlegt' : 'nicht hinterlegt', ors ? 'green' : 'gray');
  };
  updateDatenStatus();
}

// Zeit-Checkboxen
const tbox=$('tboxes');
[6,8,10,12,13,15].forEach(m=>{const l=document.createElement('label');l.innerHTML='<input type="checkbox" class="tc" value="'+m+'"'+'> '+m;tbox.appendChild(l);});
const selT=()=>new Set([...document.querySelectorAll('.tc:checked')].map(c=>+c.value));
const maxT=()=>{const s=[...selT()];return s.length?Math.max(...s):0;};

const map=L.map('map').setView([50.88,6.72],11);
let tile;
var TILES={
  'osm':{
    url:'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    attr:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom:19
  },
  'basemap-farbe':{
    url:'https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png',
    attr:'© <a href="https://www.basemap.de">basemap.de</a> / GeoBasis-DE / BKG (2024)',
    maxZoom:18
  }
};
var currentTileId='osm';
function setTile(){ switchTile('osm'); }
function switchTile(id){
  if(tile) map.removeLayer(tile);
  var t=TILES[id]||TILES['osm'];
  tile=L.tileLayer(t.url,{maxZoom:t.maxZoom,attribution:t.attr}).addTo(map);
  currentTileId=id;
  var dd=document.getElementById('tileDropdown');
  if(dd) dd.value=id;
}
setTile();

// ─────────── Hochwasser-WMS (HWRM-NRW) ───────────
// WMS-Dienste Land NRW: Gefahrenkarte + Risikokarte
// Dienstadresse + Layer-Namen gemäß WMS-Capabilities (Dezember 2019 / Aktualisierung 2024)
// Lizenz: Datenlizenz Deutschland Namensnennung 2.0 (https://www.govdata.de/dl-de/by-2-0)
const HW_WMS={
  gefahr:'https://www.wms.nrw.de/umwelt/HW_Gefahrenkarte',
  risiko:'https://www.wms.nrw.de/umwelt/HW_Risikokarte'
};
// Layer-Namen gemäß WMS-Capabilities der NRW-Gefahrenkarte.
// Suffix-Konvention: _hw = hohe Wahrscheinlichkeit (HQ10-HQ50), _mw = mittlere (HQ100), _nw = niedrig (> HQ500)
// Für Risikokarte werden die Layer direkt aus dem Risikokarten-Dienst geladen.
const HW_LAYER={
  haeufig:{
    url:HW_WMS.gefahr,
    layers:'Tiefen_Ueberflutungsgebiet_hw',
    title:'HQ häufig (alle 10–20 Jahre)'
  },
  hq100:{
    url:HW_WMS.gefahr,
    layers:'Tiefen_Ueberflutungsgebiet_mw',
    title:'HQ100 (Planungsbasis)'
  },
  extrem:{
    url:HW_WMS.gefahr,
    layers:'Tiefen_Ueberflutungsgebiet_nw',
    title:'HQ extrem (Katastrophenfall)'
  },
  risiko:{
    url:HW_WMS.risiko,
    // Risikokarte hat ähnliche Struktur – wir nehmen den HQ100-Risiko-Sub-Layer,
    // der die wichtigsten Schutzobjekte + betroffenen Einwohner enthält.
    layers:'Betroffene_Einwohner_mw',
    title:'Risikokarte – betroffene Einwohner HQ100'
  }
};
const hwLayers={}; // aktive Leaflet-WMS-Layer
const hwLegendURL=(wmsUrl,layerName)=>
  wmsUrl+'?request=GetLegendGraphic&version=1.3.0&format=image/png&layer='+encodeURIComponent(layerName);

function updateHwLegenden(){
  const box=document.getElementById('hwLegendenBox');
  const target=document.getElementById('hwLegenden');
  if(!box||!target) return;
  const aktive=Object.keys(hwLayers);
  if(aktive.length===0){box.style.display='none';target.innerHTML='';return;}
  box.style.display='block';
  target.innerHTML=aktive.map(k=>{
    const cfg=HW_LAYER[k];
    const legLayer=cfg.layers;
    return '<div style="margin:6px 0;">'
      +'<div style="font-weight:bold;margin-bottom:2px;">'+cfg.title+'</div>'
      +'<img src="'+hwLegendURL(cfg.url,legLayer)+'" alt="Legende '+cfg.title+'" '
      +'style="max-width:100%;display:block;" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\';">'
      +'<div style="display:none;color:#888;font-size:10.5px;font-style:italic;">Legende nicht verfügbar</div>'
      +'</div>';
  }).join('');
}

function toggleHwLayer(key, aktiv){
  const cfg=HW_LAYER[key];
  if(!cfg) return;
  if(aktiv){
    if(hwLayers[key]) return;
    const opac=parseInt(document.getElementById('hwOpacity').value||'60',10)/100;
    const l=L.tileLayer.wms(cfg.url,{
      layers:cfg.layers,
      format:'image/png',
      transparent:true,
      version:'1.3.0',
      opacity:opac,
      attribution:'Hochwasserdaten © Land NRW (dl-de/by-2-0)'
    });
    l.addTo(map);
    hwLayers[key]=l;
  }else{
    if(hwLayers[key]){map.removeLayer(hwLayers[key]);delete hwLayers[key];}
  }
  updateHwLegenden();
}

// Event-Handler an die Checkboxen binden
const hwChkMap={hwHaeufig:'haeufig',hwHQ100:'hq100',hwExtrem:'extrem',hwRisiko:'risiko'};
Object.entries(hwChkMap).forEach(([chkId,layerKey])=>{
  const el=document.getElementById(chkId);
  if(el){el.addEventListener('change',e=>toggleHwLayer(layerKey,e.target.checked));}
});

// Deckkraft-Slider
(function(){
  const sl=document.getElementById('hwOpacity');
  const lbl=document.getElementById('hwOpacityLabel');
  if(sl && lbl){
    sl.addEventListener('input',e=>{
      const v=parseInt(e.target.value,10);
      lbl.textContent=v+'%';
      Object.values(hwLayers).forEach(l=>l.setOpacity(v/100));
    });
  }
})();


document.getElementById('sideToggle').onclick=function(){
  const s=document.getElementById('side');
  s.classList.toggle('collapsed');
  this.textContent=s.classList.contains('collapsed')?'⮜':'⮞';
  setTimeout(()=>map.invalidateSize(),300);
};

// Straßensuche
(function(){
  var strMarker=null;
  var inp=document.getElementById("strSearch");
  var clrBtn=document.getElementById("strClear");
  function showClear(){clrBtn.style.display=inp.value?"block":"none";}
  inp.oninput=showClear;
  clrBtn.onclick=function(){
    inp.value="";
    clrBtn.style.display="none";
    if(strMarker){map.removeLayer(strMarker);strMarker=null;}
  };
  async function doSearch(){
    var q=inp.value.trim();
    if(!q)return;
    var url="https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&viewbox=6.3,50.65,7.1,51.1&bounded=1&q="+encodeURIComponent(q);
    try{
      var r=await fetch(url,{headers:{"Accept-Language":"de"}});
      var j=await r.json();
      if(!j.length){alert("Nicht gefunden: "+q);return;}
      var lat=+j[0].lat,lon=+j[0].lon;
      if(strMarker)map.removeLayer(strMarker);
      strMarker=L.marker([lat,lon],{icon:L.divIcon({className:"",
        html:"<div style='width:14px;height:14px;background:#e63946;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px #000'></div>",
        iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map)
        .bindPopup(j[0].display_name).openPopup();
      map.setView([lat,lon],16);
    }catch(e){alert("Fehler bei der Suche");}
  }
  inp.onkeydown=function(e){if(e.key==="Enter")doSearch();};
})();

// Farben pro Kommune
const KOM_COL={
  'Bedburg':'#e41a1c',
  'Bergheim':'#377eb8',
  'Brühl':'#4daf4a',
  'Elsdorf':'#984ea3',
  'Erftstadt':'#ff7f00',
  'Frechen':'#ffd92f',
  'Hürth':'#8c510a',
  'Kerpen':'#f781bf',
  'Pulheim':'#1abc9c',
  'Wesseling':'#525252'
};
function kommuneOf(stationName){
  let n=(stationName||'').trim();
  // Hauptwachen: "Feuer- und Rettungswache Hürth" -> "Hürth"
  if(n.startsWith('Feuer- und Rettungswache'))return n.replace('Feuer- und Rettungswache','').trim();
  // Neues FF-Schema: "FF Kerpen-Sindorf" -> "Kerpen", "FF Bedburg" -> "Bedburg"
  if(n.startsWith('FF ')){
    n=n.substring(3).trim();
    return n.split('-')[0].trim();
  }
  // Legacy-Fallback (alte Daten)
  if(n.startsWith('KerpenT'))return 'Kerpen';
  return n.split(' ')[0];
}
function colOf(stationName){
  return KOM_COL[kommuneOf(stationName)]||'#888';
}

// Einwohner zählen: Anzahl Zensus-Zellen-Mittelpunkte im Polygon × Einwohner
// Ray-Casting Point-in-Polygon (Lat/Lon, planar approximiert ist hier ok bei der kleinen Region)
function pointInPolygon(lat,lon,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1]; // [lon, lat]
    const xj=ring[j][0], yj=ring[j][1];
    const intersect=((yi>lat)!==(yj>lat)) && (lon<(xj-xi)*(lat-yi)/(yj-yi+1e-12)+xi);
    if(intersect)inside=!inside;
  }
  return inside;
}
function pointInGeoJSONPolygon(lat,lon,geometry){
  // unterstützt Polygon und MultiPolygon
  if(geometry.type==='Polygon'){
    if(!pointInPolygon(lat,lon,geometry.coordinates[0]))return false;
    // Löcher
    for(let h=1;h<geometry.coordinates.length;h++){
      if(pointInPolygon(lat,lon,geometry.coordinates[h]))return false;
    }
    return true;
  }
  if(geometry.type==='MultiPolygon'){
    for(const poly of geometry.coordinates){
      if(pointInPolygon(lat,lon,poly[0])){
        let inHole=false;
        for(let h=1;h<poly.length;h++){
          if(pointInPolygon(lat,lon,poly[h])){inHole=true;break;}
        }
        if(!inHole)return true;
      }
    }
  }
  return false;
}
// Cache für Gesamt-Einwohnerzahlen pro Kommune (einmalig berechnet)
const _komTotalCache={};
function getKomTotal(kommune){
  if(!DATA.bevoelkerung||!DATA.kommunen)return null;
  if(_komTotalCache[kommune]!==undefined)return _komTotalCache[kommune];
  const f=DATA.kommunen.features.find(x=>x.properties.name===kommune);
  if(!f){_komTotalCache[kommune]=null;return null;}
  let sum=0;
  for(const c of DATA.bevoelkerung.cells){
    if(pointInGeoJSONPolygon(c[0],c[1],f.geometry))sum+=c[2];
  }
  _komTotalCache[kommune]=sum;
  return sum;
}

function countEinwohner(geometry, ownKommune){
  // Liefert {rek, ownKom, komTotal, hasKom}
  if(!DATA.bevoelkerung||!DATA.bevoelkerung.cells)return null;
  const hasKom=!!(DATA.kommunen&&DATA.kommunen.features);
  let komPolys=[],ownPolys=[];
  if(hasKom){
    DATA.kommunen.features.forEach(f=>{
      komPolys.push(f.geometry);
      if(f.properties.name===ownKommune)ownPolys.push(f.geometry);
    });
  }
  let latMin=90,latMax=-90,lonMin=180,lonMax=-180;
  function scan(coords){
    for(const ring of coords){
      for(const pt of (Array.isArray(ring[0])?ring:[ring])){
        const lo=pt[0],la=pt[1];
        if(la<latMin)latMin=la;if(la>latMax)latMax=la;
        if(lo<lonMin)lonMin=lo;if(lo>lonMax)lonMax=lo;
      }
    }
  }
  if(geometry.type==='Polygon'){scan(geometry.coordinates);}
  else if(geometry.type==='MultiPolygon'){geometry.coordinates.forEach(scan);}
  let rek=0,ownKom=0;
  for(const c of DATA.bevoelkerung.cells){
    const la=c[0],lo=c[1];
    if(la<latMin||la>latMax||lo<lonMin||lo>lonMax)continue;
    if(!pointInGeoJSONPolygon(la,lo,geometry))continue;
    if(hasKom){
      let inRek=false;
      for(const kg of komPolys){if(pointInGeoJSONPolygon(la,lo,kg)){inRek=true;break;}}
      if(!inRek)continue;
      rek+=c[2];
      for(const kg of ownPolys){if(pointInGeoJSONPolygon(la,lo,kg)){ownKom+=c[2];break;}}
    }else{
      rek+=c[2];
    }
  }
  const komTotal=hasKom?getKomTotal(ownKommune):null;
  return {rek,ownKom,komTotal,hasKom};
}
function fmtNum(n){return n.toLocaleString('de-DE');}

// Zählt Einwohner die in der Kommune UND in mindestens einem der Geometrien liegen
function countUnionInKommune(geometries, kommune){
  if(!DATA.bevoelkerung||!DATA.kommunen)return 0;
  const komFeat=DATA.kommunen.features.find(x=>x.properties.name===kommune);
  if(!komFeat)return 0;
  // BBox der Vereinigung aller Geometrien
  let latMin=90,latMax=-90,lonMin=180,lonMax=-180;
  function scan(coords){
    for(const ring of coords){
      for(const pt of (Array.isArray(ring[0])?ring:[ring])){
        const lo=pt[0],la=pt[1];
        if(la<latMin)latMin=la;if(la>latMax)latMax=la;
        if(lo<lonMin)lonMin=lo;if(lo>lonMax)lonMax=lo;
      }
    }
  }
  geometries.forEach(g=>{
    if(g.type==='Polygon')scan(g.coordinates);
    else if(g.type==='MultiPolygon')g.coordinates.forEach(scan);
  });
  let sum=0;
  for(const c of DATA.bevoelkerung.cells){
    const la=c[0],lo=c[1];
    if(la<latMin||la>latMax||lo<lonMin||lo>lonMax)continue;
    if(!pointInGeoJSONPolygon(la,lo,komFeat.geometry))continue;
    for(const g of geometries){
      if(pointInGeoJSONPolygon(la,lo,g)){sum+=c[2];break;}
    }
  }
  return sum;
}

// Schraffur-Pattern für Überlappungen via SVG-Defs in der Leaflet-Overlay-Pane
function ensureHatchPattern(){
  const svg=document.querySelector('.leaflet-overlay-pane svg');
  if(!svg)return;
  if(svg.querySelector('#hatchPattern'))return;
  const NS='http://www.w3.org/2000/svg';
  const defs=document.createElementNS(NS,'defs');
  defs.innerHTML='<pattern id="hatchPattern" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="1.2" stroke-opacity="0.55"/></pattern>';
  svg.insertBefore(defs,svg.firstChild);
}

// Wachen mit Iso-Mapping (Präfix-Match für "Name (Adresse)" Varianten)
const isoNames=[...new Set(DATA.isochrones.features.map(f=>f.properties.station_name))];
// Wachen-Marker: rotes Quadrat mit Text "HW" (Hauptwache) oder "FF" (Freiwillige)
function makeWacheIcon(isHaupt){
  const label=isHaupt?'HW':'FF';
  const size=isHaupt?22:18;
  const fontSize=isHaupt?11:9;
  return L.divIcon({
    className:'',
    html:'<div style="width:'+size+'px;height:'+size+'px;background:#c8102e;border:1.5px solid #fff;'
        +'box-shadow:0 1px 3px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;'
        +'border-radius:2px;color:#fff;font-family:Arial,sans-serif;font-weight:bold;font-size:'+fontSize+'px;'
        +'letter-spacing:0.5px;line-height:1;">'+label+'</div>',
    iconSize:[size,size],
    iconAnchor:[size/2,size/2]
  });
}

function buildWachenPopup(s){
  const isHaupt=s.name.startsWith('Feuer- und Rettungswache');
  const traeger=isHaupt?'Hauptamtliche Wache':'Freiwillige Feuerwehr';
  const kom=kommuneOf(s.name);
  // Stadt-Ortsteil aus dem Namen ableiten
  let standortStr;
  if(isHaupt){
    standortStr=kom;
  }else{
    // FF Kerpen-Sindorf -> Kerpen-Sindorf
    standortStr=s.name.replace(/^FF\s+/,'');
  }
  const adr=(s.adresse||'').trim();
  return ''
    +'<div class="wache-popup">'
    +'<div class="wache-title">'+s.name+'</div>'
    +'<div class="wache-meta">'+kom+' · '+traeger+'</div>'
    +(adr?'<div class="wache-adr">'+adr+'<br>'+standortStr+'</div>':'')
    +'</div>';
}

const wMarkers=DATA.stations.map((s,idx)=>{
  const isoSet=new Set(isoNames.filter(n=>n===s.name||n.startsWith(s.name+' (')));
  const isHaupt=s.name.startsWith('Feuer- und Rettungswache');
  return{
    name:s.name,
    idx,
    on:false,
    isoSet,
    m:L.marker([s.lat,s.lon],{icon:makeWacheIcon(isHaupt)}).bindPopup(buildWachenPopup(s),{maxWidth:280})
  };
});

let isoLayer=L.layerGroup().addTo(map);
let isoOverlapLayer=L.layerGroup().addTo(map); // Schraffur für Überlappungen
const wLayer=L.layerGroup().addTo(map);

function refreshIso(){
  isoLayer.clearLayers();
  isoOverlapLayer.clearLayers();
  // Iso nur anzeigen, wenn im Wachen-Reiter "Wachen + Isochronen anzeigen" aktiv ist
  if(!$('shS').checked)return;
  const sel=selT();
  if(!sel.size)return;
  const prof=$('prof').value;
  const op=parseFloat($('op').value)/100;

  // Sichtbare Iso-Features sammeln: nur Wachen, die der Nutzer im Wachen-Reiter aktiviert hat
  const visible=DATA.isochrones.features.filter(f=>{
    const p=f.properties;
    if(!p.profile||p.profile!==prof||!sel.has(p.minutes))return false;
    const w=wMarkers.find(x=>x.isoSet.has(p.station_name));
    return w?w.on:false;
  });

  // Erste Layer: normale Iso-Polygone in Kommune-Farbe + Klick-Popup
  L.geoJSON({type:'FeatureCollection',features:visible},{
    style:f=>{
      const c=colOf(f.properties.station_name);
      return{color:c,weight:1.2,fillColor:c,fillOpacity:op,opacity:0.85};
    },
    onEachFeature:(f,layer)=>{
      layer.on('click',e=>{
        L.DomEvent.stopPropagation(e);
        const p=f.properties;
        const kom=kommuneOf(p.station_name);
        // Sofort Popup mit "berechne…" zeigen, dann nachrechnen
        const popup=L.popup({maxWidth:400}).setLatLng(e.latlng).setContent(
          '<div class="iso-popup"><div class="iso-title">'+p.station_name+'</div>'
          +'<div class="iso-meta">'+kom+' · '+p.profile+' · '+p.minutes+' Min</div>'
          +'<div style="color:#888;font-style:italic;margin-top:6px;">Berechne Einwohner …</div></div>'
        ).openOn(map);
        setTimeout(()=>{
          const ew=countEinwohner(f.geometry,kom);
          let body;
          if(ew===null){
            body='<div class="iso-meta">Bevölkerungsdaten nicht verfügbar</div>';
          }else if(ew.hasKom){
            const pctKom = ew.komTotal ? Math.round(100*ew.ownKom/ew.komTotal) : 0;
            // Union-Abdeckung aller aktiven Wachen derselben Kommune, gleiche Zeitstufe/Profil
            const otherActiveInKom=wMarkers.filter(w=>w.on && kommuneOf(w.name)===kom && w.name!==p.station_name);
            let unionBlock='';
            if(otherActiveInKom.length>0){
              // Alle Iso-Features dieser Wachen sammeln (gleiche Zeitstufe + Profil)
              const geoms=[f.geometry];
              const names=[];
              otherActiveInKom.forEach(w=>{
                DATA.isochrones.features.forEach(fe=>{
                  const pr=fe.properties;
                  if(pr.feature_type==='isochrone' && pr.profile===p.profile && pr.minutes===p.minutes && w.isoSet.has(pr.station_name)){
                    geoms.push(fe.geometry);
                    if(!names.includes(pr.station_name))names.push(pr.station_name);
                  }
                });
              });
              if(geoms.length>=2){
                const unionEW=countUnionInKommune(geoms,kom);
                const pctUnion=ew.komTotal?Math.round(100*unionEW/ew.komTotal):0;
                unionBlock=''
                  +'<div class="iso-block-title">Zusammen mit weiteren aktiven Wachen in '+kom+':</div>'
                  +'<table class="iso-table">'
                  +'<tr><td>Gemeinsam erreicht in '+kom+'</td><td class="num"><b>'+fmtNum(unionEW)+'</b></td></tr>'
                  +'<tr class="iso-pct"><td>Anteil an '+kom+'</td><td class="num"><b>'+pctUnion+'%</b></td></tr>'
                  +'</table>'
                  +'<div class="iso-umfasst">umfasst zusätzlich: '+names.map(n=>n.replace('Feuer- und Rettungswache ','').replace(kom+' ','')).join(', ')+'</div>';
              }
            }
            body=''
              +'<div class="iso-block-title">Diese Wache alleine erreicht:</div>'
              +'<table class="iso-table">'
              +'<tr><td>Einwohner im Rhein-Erft-Kreis</td><td class="num"><b>'+fmtNum(ew.rek)+'</b></td></tr>'
              +'<tr><td>davon in '+kom+'</td><td class="num"><b>'+fmtNum(ew.ownKom)+'</b></td></tr>'
              +'<tr class="iso-pct"><td>Anteil an '+kom+' ('+fmtNum(ew.komTotal)+' EW)</td><td class="num"><b>'+pctKom+'%</b></td></tr>'
              +'</table>'
              +unionBlock
              +'<div class="iso-meta" style="margin-top:6px;">Quelle: Zensus 2022 · OSM</div>';
          }else{
            body='<div><b>'+fmtNum(ew.rek)+'</b> Einwohner abgedeckt</div>'
              +'<div class="iso-meta">Quelle: Zensus 2022</div>';
          }
          popup.setContent(
            '<div class="iso-popup"><div class="iso-title">'+p.station_name+'</div>'
            +'<div class="iso-meta">'+kom+' · '+p.profile+' · '+p.minutes+' Min</div>'
            +body+'</div>'
          );
        },10);
      });
    }
  }).eachLayer(l=>isoLayer.addLayer(l));

  // Schraffur: ECHTE Schnittflächen zwischen Hüllen verschiedener Wachen
  // Pro Wache nur die größte sichtbare Iso (deckt die kleineren intern).
  const byStation={};
  visible.forEach(f=>{
    const n=f.properties.station_name;
    if(!byStation[n]||f.properties.minutes>byStation[n].properties.minutes){
      byStation[n]=f;
    }
  });
  const hulls=Object.values(byStation);
  if(hulls.length>=2 && typeof turf!=='undefined'){
    const intersects=[];
    for(let i=0;i<hulls.length;i++){
      for(let j=i+1;j<hulls.length;j++){
        // Nur wenn die beiden Wachen aus UNTERSCHIEDLICHEN Kommunen stammen
        const ki=kommuneOf(hulls[i].properties.station_name);
        const kj=kommuneOf(hulls[j].properties.station_name);
        if(ki===kj)continue;
        try{
          const inter=turf.intersect(turf.featureCollection([hulls[i],hulls[j]]));
          if(inter && inter.geometry && (inter.geometry.coordinates||[]).length){
            intersects.push(inter);
          }
        }catch(err){/* Turf wirft bei degenerierten Polygonen, ignorieren */}
      }
    }
    if(intersects.length){
      L.geoJSON({type:'FeatureCollection',features:intersects},{
        style:()=>({color:'#000',weight:0,fillColor:'url(#hatchPattern)',fillOpacity:0.7}),
        interactive:false
      }).eachLayer(l=>isoOverlapLayer.addLayer(l));
      setTimeout(ensureHatchPattern,0);
    }
  }

  // ─────────────── Einsatzgrenzen bei Überlappung anzeigen (Voronoi-basiert) ───────────────
  // Vorgehen:
  //  1. Gesamte Überlappungsfläche ermitteln (Summe aller Paar-Schnitte verschiedener Kommunen).
  //  2. Für alle an Überlappungen beteiligten Wachen Voronoi-Zellen bilden.
  //  3. Jede Voronoi-Zelle mit der Überlappungsfläche verschneiden → Einsatzgebiet dieser Wache.
  //  4. Einfärben in der Farbe der Kommune der jeweiligen Wache.
  //  5. Grenzen der Voronoi-Zellen innerhalb der Überlappung als gestrichelte Trennlinien.
  if($('showBorder') && $('showBorder').checked && typeof turf!=='undefined' && hulls.length>=2){
    const stByName={};
    (DATA.stations||[]).forEach(s=>{stByName[s.name]={lat:s.lat,lon:s.lon};});

    // Schritt 1: Union aller Paarschnitte verschiedener Kommunen = Gesamte Überlappungsfläche
    let overlapUnion=null;
    const involvedStations=new Set(); // Wachen die an mind. einer Überlappung beteiligt sind
    for(let i=0;i<hulls.length;i++){
      for(let j=i+1;j<hulls.length;j++){
        const nA=hulls[i].properties.station_name;
        const nB=hulls[j].properties.station_name;
        const kA=kommuneOf(nA), kB=kommuneOf(nB);
        if(kA===kB)continue;
        try{
          const inter=turf.intersect(turf.featureCollection([hulls[i],hulls[j]]));
          if(inter && inter.geometry && (inter.geometry.coordinates||[]).length){
            involvedStations.add(nA);
            involvedStations.add(nB);
            if(!overlapUnion){
              overlapUnion=inter;
            }else{
              try{
                const u=turf.union(turf.featureCollection([overlapUnion,inter]));
                if(u && u.geometry) overlapUnion=u;
              }catch(e){/* degeneriert → behalten */}
            }
          }
        }catch(e){/* Turf: ignore */}
      }
    }

    if(overlapUnion && involvedStations.size>=2){
      // Schritt 2: Voronoi für alle beteiligten Wachen
      const points=[];
      const ptMeta=[]; // Parallel-Array: {name, kommune, lat, lon}
      involvedStations.forEach(n=>{
        const s=stByName[n];
        if(!s) return;
        points.push(turf.point([s.lon,s.lat]));
        ptMeta.push({name:n,kommune:kommuneOf(n),lat:s.lat,lon:s.lon});
      });

      // Voronoi-BBox: großzügig um die REK-Region legen damit alle Zellen finit sind
      const bbox=[5.9, 50.55, 7.2, 51.15]; // west, süd, ost, nord
      let voronoi;
      try{
        voronoi=turf.voronoi(turf.featureCollection(points),{bbox:bbox});
      }catch(e){voronoi=null;}

      const colorByKom=kom=>(KOM_COL[kom]||'#888');

      if(voronoi && voronoi.features){
        // Schritt 3-4: Jede Voronoi-Zelle mit Überlappungsfläche verschneiden
        const zellen=[];
        voronoi.features.forEach((vf,idx)=>{
          if(!vf || !vf.geometry) return;
          const meta=ptMeta[idx];
          if(!meta) return;
          let part;
          try{
            part=turf.intersect(turf.featureCollection([vf,overlapUnion]));
          }catch(e){return;}
          if(!part||!part.geometry||!(part.geometry.coordinates||[]).length) return;
          part.properties={meta:meta,cell:vf};
          zellen.push(part);
        });

        // Popup-Builder: zeigt welche Wache hier näher ist + Entfernungen zu den anderen
        function hav(la1,lo1,la2,lo2){
          const R=6371000, p=Math.PI/180;
          const a=0.5-Math.cos((la2-la1)*p)/2+Math.cos(la1*p)*Math.cos(la2*p)*(1-Math.cos((lo2-lo1)*p))/2;
          return 2*R*Math.asin(Math.sqrt(a));
        }

        // Aktuelles Profil (PKW/LKW) wie im UI gewählt
        const aktuellesProfil=$('prof')?$('prof').value:'LKW';

        // Findet die kleinste Iso-Zeitstufe (Minuten) einer Wache, die den Punkt [lon,lat] enthält.
        // Gibt null zurück, wenn keine Zeitstufe den Punkt enthält.
        function erreichbarIn(stationName, lonLat, profile){
          const pt=turf.point(lonLat);
          const stufen=DATA.isochrones.features
            .filter(f=>f.properties.feature_type==='isochrone'
                    && f.properties.station_name===stationName
                    && f.properties.profile===profile)
            .sort((a,b)=>a.properties.minutes-b.properties.minutes);
          for(const iso of stufen){
            try{
              if(turf.booleanPointInPolygon(pt,iso)) return iso.properties.minutes;
            }catch(e){}
          }
          return null;
        }

        // Kommune ermitteln in der der Punkt liegt (aus kommunen_rek.geojson)
        function kommuneAtPoint(lonLat){
          if(!DATA.kommunen||!DATA.kommunen.features) return null;
          const pt=turf.point(lonLat);
          for(const kf of DATA.kommunen.features){
            try{
              if(turf.booleanPointInPolygon(pt,kf)) return kf.properties.name;
            }catch(e){}
          }
          return null;
        }

        function buildPopup(meta,ctr){
          // Liste aller Wachen mit Fahrzeit-Stufe für ctr (sortiert: erreichbar zuerst, kleinste Stufe zuerst)
          const all=ptMeta.map(m=>{
            const mins=erreichbarIn(m.name,ctr,aktuellesProfil);
            const dist=hav(ctr[1],ctr[0],m.lat,m.lon);
            return {name:m.name,kommune:m.kommune,mins:mins,dist:dist};
          });
          // Sortierung: erreichbare zuerst nach Minuten aufsteigend, Rest nach Luftlinie
          all.sort((a,b)=>{
            if(a.mins!=null && b.mins!=null) return a.mins-b.mins;
            if(a.mins!=null) return -1;
            if(b.mins!=null) return 1;
            return a.dist-b.dist;
          });
          const first=all[0], second=all[1]||null;
          const komAtCtr=kommuneAtPoint(ctr)||meta.kommune;
          const KOM_COL_LOCAL=KOM_COL||{};

          let html='<div class="iso-popup" style="font-size:12px;line-height:1.5;">'
            +'<div class="iso-title" style="color:'+(KOM_COL_LOCAL[meta.kommune]||'#333')+';">Einsatzgebiet '+meta.kommune+'</div>'
            +'<div class="iso-meta">in diesem Teil der Überlappungsfläche</div>'
            +'<div style="margin-top:4px;"><b>Kommunale Zuständigkeit:</b> '+komAtCtr+'</div>';

          // Fahrzeit-Block
          if(first && first.mins!=null){
            html+='<div style="margin-top:6px;">'
              +'<b>Fahrzeit-nächste Wache:</b> '+first.name+' (in '+first.mins+' Min erreichbar)'
              +'</div>';
            if(second && second.mins!=null){
              html+='<div><b>Zweitschnellste:</b> '+second.name+' (in '+second.mins+' Min erreichbar)</div>';
              const diff=second.mins-first.mins;
              html+='<div><b>Differenz:</b> ~'+diff+' Min</div>';
            }else if(second){
              html+='<div><b>Zweitschnellste:</b> '+second.name+' (außerhalb der max. Iso)</div>';
            }
          }else{
            html+='<div style="margin-top:6px;color:#888;"><i>Keine Wache erreicht diesen Punkt in den vorhandenen Iso-Zeitstufen ('+aktuellesProfil+').</i></div>';
          }

          // Luftlinien-Info kompakt
          const luft=all.slice(0,3).map(w=>w.name.replace(/^Feuer- und Rettungswache /,'FRW ').replace(/^FF /,'FF ')+': '+(w.dist/1000).toFixed(2)+' km').join(' · ');
          if(luft){
            html+='<div style="margin-top:6px;font-size:11px;color:#666;"><i>Luftlinien: '+luft+'</i></div>';
          }

          // Kurzer Hinweis
          html+='<div style="margin-top:8px;padding:5px 7px;background:#fff8e6;border-left:3px solid #f0c040;border-radius:2px;color:#6b5515;font-size:11px;line-height:1.4;">'
            +'Hinweis: Die Voronoi-Grenzlinien basieren auf Luftlinien-Abständen. Die angezeigten Fahrzeiten stammen aus den berechneten Isochronen (OSM-Straßennetz, Profil '+aktuellesProfil+') und sind aussagekräftiger. '
            +'Interkommunale Vereinbarungen sowie Ausrück- und Dispositionszeiten sind nicht berücksichtigt.'
            +'</div></div>';
          return html;
        }

        // Schritt 4: Flächen zeichnen
        if(zellen.length){
          const fc=zellen.map(z=>{
            const m=z.properties.meta;
            const ctr=turf.centerOfMass(z).geometry.coordinates;
            z.properties.col=colorByKom(m.kommune);
            z.properties.popup=buildPopup(m,ctr);
            return z;
          });
          L.geoJSON({type:'FeatureCollection',features:fc},{
            style:f=>({color:f.properties.col,weight:0,fillColor:f.properties.col,fillOpacity:0.55}),
            onEachFeature:(f,l)=>l.bindPopup(f.properties.popup,{maxWidth:300})
          }).eachLayer(l=>isoOverlapLayer.addLayer(l));
        }

        // Schritt 5: Trennlinien = Ränder der Voronoi-Zellen, auf die Überlappungsfläche geclippt
        // Ansatz: Für jedes Zellenpaar (i,j) Schnittkante als LineString bestimmen und mit overlapUnion clippen
        // Einfacher: Alle Polygon-Ringe aller Zellen in LineStrings wandeln und mit Rand der overlapUnion XOR verrechnen
        // Praktische Umsetzung: Für jedes zellen-Paar die geteilte Kante finden, dann clippen
        const trennLinien=[];
        for(let i=0;i<voronoi.features.length;i++){
          for(let j=i+1;j<voronoi.features.length;j++){
            const a=voronoi.features[i], b=voronoi.features[j];
            if(!a||!b||!a.geometry||!b.geometry) continue;
            try{
              // Schnitt der Ränder: turf.lineIntersect zwischen den beiden Zell-Umrissen
              const la=turf.polygonToLine(a);
              const lb=turf.polygonToLine(b);
              const pts=turf.lineIntersect(la,lb);
              if(pts && pts.features && pts.features.length>=2){
                // Verbinde diese Schnittpunkte als Linie
                const ptsCoords=pts.features.map(f=>f.geometry.coordinates);
                // Nur Liniensegmente innerhalb overlapUnion behalten
                const raw=turf.lineString([ptsCoords[0],ptsCoords[ptsCoords.length-1]]);
                // Clippen: Mittelpunkt prüfen ob in Überlappungsfläche
                const mid=[(ptsCoords[0][0]+ptsCoords[ptsCoords.length-1][0])/2,
                           (ptsCoords[0][1]+ptsCoords[ptsCoords.length-1][1])/2];
                if(turf.booleanPointInPolygon(turf.point(mid),overlapUnion)){
                  trennLinien.push(raw);
                }else{
                  // Falls Mitte draußen: clippe einzelne Sub-Segmente
                  const li=turf.lineIntersect(raw,overlapUnion);
                  if(li && li.features && li.features.length>=2){
                    const seg=li.features.map(f=>f.geometry.coordinates);
                    seg.sort((x,y)=>{
                      const dA=(x[0]-ptsCoords[0][0])**2+(x[1]-ptsCoords[0][1])**2;
                      const dB=(y[0]-ptsCoords[0][0])**2+(y[1]-ptsCoords[0][1])**2;
                      return dA-dB;
                    });
                    trennLinien.push(turf.lineString([seg[0],seg[seg.length-1]]));
                  }
                }
              }
            }catch(e){/* ignore */}
          }
        }
        if(trennLinien.length){
          L.geoJSON({type:'FeatureCollection',features:trennLinien},{
            style:{color:'#222',weight:2.5,dashArray:'6,4',opacity:0.85},
            interactive:false
          }).eachLayer(l=>isoOverlapLayer.addLayer(l));
        }
      }
    }
  }

  // ─────────────── Nicht-abgedeckte Bereiche markieren ───────────────
  // Pro aktiver Kommune: Kommune-Polygon minus Union aller aktiven Iso → roter Layer.
  // Wenn keine Kommune-Geometrien eingebettet sind, wird als Ersatz-Bezugsfläche
  // die konvexe Hülle aller aktiven Wachen (mit Buffer) verwendet.
  if($('showGap') && $('showGap').checked && typeof turf!=='undefined' && hulls.length){
    const hasKomGeom = !!(DATA.kommunen && DATA.kommunen.features);
    const gapFeatures=[];
    try{
      if(hasKomGeom){
        // Originalpfad: pro Kommune Kommune\Union(Iso)
        const byKom={};
        hulls.forEach(f=>{
          const k=kommuneOf(f.properties.station_name);
          (byKom[k]=byKom[k]||[]).push(f);
        });
        Object.entries(byKom).forEach(([kom,polys])=>{
          const komFeat=DATA.kommunen.features.find(x=>x.properties.name===kom);
          if(!komFeat)return;
          try{
            let union=polys[0];
            for(let i=1;i<polys.length;i++){
              const u=turf.union(turf.featureCollection([union,polys[i]]));
              if(u && u.geometry)union=u;
            }
            const diff=turf.difference(turf.featureCollection([komFeat,union]));
            if(diff && diff.geometry && (diff.geometry.coordinates||[]).length){
              diff.properties={kommune:kom,label:kom};
              gapFeatures.push(diff);
            }
          }catch(err){}
        });
      } else {
        // Fallback: konvexe Hülle aller aktiven Wachen + 2km Buffer als Bezugsfläche
        const activePts=[];
        wMarkers.forEach(w=>{
          if(!w.on)return;
          const s=DATA.stations.find(x=>x.name===w.name);
          if(s && typeof s.lon==='number' && typeof s.lat==='number'){
            activePts.push(turf.point([s.lon,s.lat]));
          }
        });
        if(activePts.length>=3){
          try{
            const hull=turf.convex(turf.featureCollection(activePts));
            if(hull){
              const buffered=turf.buffer(hull,2,{units:'kilometers'});
              // Union aller Iso-Hüllen
              let isoUnion=hulls[0];
              for(let i=1;i<hulls.length;i++){
                try{
                  const u=turf.union(turf.featureCollection([isoUnion,hulls[i]]));
                  if(u && u.geometry)isoUnion=u;
                }catch(err){}
              }
              const diff=turf.difference(turf.featureCollection([buffered,isoUnion]));
              if(diff && diff.geometry && (diff.geometry.coordinates||[]).length){
                diff.properties={label:'Außerhalb der gewählten Abdeckung'};
                gapFeatures.push(diff);
              }
            }
          }catch(err){}
        }
      }
    }catch(err){}
    if(gapFeatures.length){
      L.geoJSON({type:'FeatureCollection',features:gapFeatures},{
        style:()=>({color:'#c8102e',weight:1,fillColor:'#c8102e',fillOpacity:0.35,opacity:0.85,dashArray:'4,3'}),
        onEachFeature:(f,layer)=>{
          const lbl=f.properties.label||f.properties.kommune||'';
          layer.bindPopup(
            '<div class="iso-popup">'
            +'<div class="iso-title" style="color:#c8102e;">Nicht abgedeckt</div>'
            +(f.properties.kommune?'<div class="iso-meta">Kommune: '+f.properties.kommune+'</div>':'')
            +'<div style="font-size:11px;line-height:1.4;">'
            +(f.properties.kommune
              ? 'Dieser Bereich liegt innerhalb der Kommune <b>'+f.properties.kommune+'</b>, aber außerhalb der Reichweite der gewählten Wachen und Zeitstufen.'
              : 'Dieser Bereich liegt außerhalb der Reichweite der gewählten Wachen und Zeitstufen (Bezugsfläche: konvexe Hülle der aktiven Wachen + 2 km).')
            +'</div></div>',{maxWidth:280}
          );
        }
      }).eachLayer(l=>isoOverlapLayer.addLayer(l));
    }
  }
}
function refreshW(){wLayer.clearLayers();if($('shS').checked)wMarkers.forEach(w=>{if(w.on)wLayer.addLayer(w.m);});refreshIso();update();}

const wlist=$('wlist');
wMarkers.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(w=>{const l=document.createElement('label');l.style.display='block';l.innerHTML='<input type="checkbox" class="wc" data-i="'+w.idx+'"> '+w.name;wlist.appendChild(l);});
document.querySelectorAll('.wc').forEach(c=>c.onchange=e=>{wMarkers[+e.target.dataset.i].on=e.target.checked;refreshW();});
function setAllW(v){document.querySelectorAll('.wc').forEach(c=>{c.checked=v;wMarkers[+c.dataset.i].on=v;});refreshW();}
$('shS').onchange=function(){
  // Komfort: Beim Aktivieren alle Wachen automatisch einschalten, wenn noch keine aktiv
  if(this.checked && !wMarkers.some(w=>w.on)){
    wMarkers.forEach(w=>w.on=true);
    document.querySelectorAll('.wc').forEach(c=>c.checked=true);
  }
  refreshW();
};
$('wSearch').oninput=function(){
  const q=this.value.toLowerCase();
  if(q)$('wDetails').open=true;
  document.querySelectorAll('#wlist label').forEach(l=>{l.style.display=l.textContent.toLowerCase().includes(q)?'block':'none';});
  $('wSearchClear').style.display=this.value?'block':'none';
};
$('wSearchClear').onclick=function(){const i=$('wSearch');i.value='';i.dispatchEvent(new Event('input'));i.focus();};

// Einsatz-Filter (unabhängig)
const uniq=a=>[...new Set(a)].sort();
// Ort Mehrfachauswahl
const allOrte=uniq(DATA.incidents.map(i=>i.ort));
const folist=$('folist');
allOrte.forEach(v=>{const l=document.createElement('label');l.style.display='block';l.innerHTML='<input type="checkbox" class="ortc" value="'+v.replace(/"/g,'&quot;')+'"> '+v;folist.appendChild(l);});
function selOrt(){return new Set([...document.querySelectorAll('.ortc:checked')].map(c=>c.value));}
function updOrtInfo(){const s=selOrt();$('foInfo').textContent=s.size===0?'(keine)':(s.size===allOrte.length?'(alle)':'('+s.size+'/'+allOrte.length+')');}
function setAllOrt(v){
  document.querySelectorAll('.ortc').forEach(c=>c.checked=v);
  refillSt();
  // Bei "Alle" auch alle Stadtteile ankreuzen
  if(v){document.querySelectorAll('.stc').forEach(c=>c.checked=true);updStInfo();}
  updOrtInfo();update();if(typeof updateHFLayer==='function')updateHFLayer();
}
// Ort-Suchfeld: Live-Filter
$('ortSearch').oninput=function(){
  const q=this.value.toLowerCase();
  if(q)$('ortDetails').open=true;
  document.querySelectorAll('#folist label').forEach(l=>{l.style.display=l.textContent.toLowerCase().includes(q)?'block':'none';});
  $('ortSearchClear').style.display=this.value?'block':'none';
};
$('ortSearchClear').onclick=function(){const i=$('ortSearch');i.value='';i.dispatchEvent(new Event('input'));i.focus();};
// Ort-Checkbox-Handler: bei Änderung Stadtteile dieses Orts mit-anhaken/abhaken
document.querySelectorAll('.ortc').forEach(c=>c.onchange=function(){
  const ort=this.value;
  const checked=this.checked;
  // Stadtteile dieses Orts identifizieren
  const stsOfOrt=new Set(DATA.incidents.filter(i=>i.ort===ort).map(i=>i.st));
  refillSt();
  // Nach refillSt: für jeden Stadtteil dieses Orts Checkbox setzen
  document.querySelectorAll('.stc').forEach(stc=>{
    if(stsOfOrt.has(stc.value)){stc.checked=checked;}
  });
  updStInfo();updOrtInfo();update();if(typeof updateHFLayer==='function')updateHFLayer();
});
updOrtInfo();
const allYR=[...new Set(DATA.incidents.map(i=>i.yr))].sort();
const yrlist=$('yrlist');
allYR.forEach(y=>{const l=document.createElement('label');l.style.fontSize='12px';l.innerHTML='<input type="checkbox" class="yc" value="'+y+'"> '+y;yrlist.appendChild(l);});
function selYR(){return new Set([...document.querySelectorAll('.yc:checked')].map(c=>+c.value));}
function updYrInfo(){const s=selYR();$('yrInfo').textContent=s.size===0?'(keine)':(s.size===allYR.length?'(alle)':'('+s.size+'/'+allYR.length+')');}
document.querySelectorAll('.yc').forEach(c=>c.onchange=()=>{updYrInfo();update();});
updYrInfo();
const allSW=uniq(DATA.incidents.map(i=>i.sw));
const fwlist=$('fwlist');
allSW.forEach(v=>{const l=document.createElement('label');l.style.display='block';l.innerHTML='<input type="checkbox" class="swc" value="'+v.replace(/"/g,'&quot;')+'"> '+v;fwlist.appendChild(l);});
function selSW(){return new Set([...document.querySelectorAll('.swc:checked')].map(c=>c.value));}
function updFwInfo(){const s=selSW();$('fwInfo').textContent=s.size===0?'(keine)':(s.size===allSW.length?'(alle)':'('+s.size+'/'+allSW.length+')');}
function setAllSW(v){document.querySelectorAll('.swc').forEach(c=>c.checked=v);updFwInfo();update();}
document.querySelectorAll('.swc').forEach(c=>c.onchange=()=>{updFwInfo();update();});
updFwInfo();
$('swSearch').oninput=function(){
  const q=this.value.toLowerCase();
  if(q)$('swDetails').open=true;
  document.querySelectorAll('#fwlist label').forEach(l=>{l.style.display=l.textContent.toLowerCase().includes(q)?'block':'none';});
  $('swSearchClear').style.display=this.value?'block':'none';
};
$('swSearchClear').onclick=function(){const i=$('swSearch');i.value='';i.dispatchEvent(new Event('input'));i.focus();};
// Stadtteil Mehrfachauswahl
const allSt_global=uniq(DATA.incidents.map(i=>i.st));
function refillSt(){
  // Aktuell selektierte Stadtteile merken
  const wasChecked=new Set([...document.querySelectorAll('.stc:checked')].map(c=>c.value));
  const selO=selOrt();
  const sts=uniq(DATA.incidents.filter(i=>selO.has(i.ort)).map(i=>i.st));
  const fslist=$('fslist');fslist.innerHTML='';
  sts.forEach(v=>{
    const l=document.createElement('label');l.style.display='block';
    const checkedAttr=wasChecked.has(v)?' checked':'';
    l.innerHTML='<input type="checkbox" class="stc" value="'+v.replace(/"/g,'&quot;')+'"'+checkedAttr+'> '+v;
    fslist.appendChild(l);
  });
  document.querySelectorAll('.stc').forEach(c=>c.onchange=()=>{updStInfo();update();if(typeof updateHFLayer==='function')updateHFLayer();});
  updStInfo();
}
function selSt(){return new Set([...document.querySelectorAll('.stc:checked')].map(c=>c.value));}
function updStInfo(){const all=document.querySelectorAll('.stc').length;const s=selSt();$('fsInfo').textContent=s.size===0?'(keine)':(s.size===all?'(alle)':'('+s.size+'/'+all+')');}
function setAllSt(v){document.querySelectorAll('.stc').forEach(c=>c.checked=v);updStInfo();update();}
refillSt();

let cl=L.markerClusterGroup(),pts=L.layerGroup(),heat=L.layerGroup(),unc=L.layerGroup(),heatClick=L.layerGroup();
window.einsHidden=true;
function toggleEinsaetze(){window.einsHidden=!window.einsHidden;const b=document.getElementById('toggleEins');if(window.einsHidden){[cl,pts,heat,unc,heatClick].forEach(l=>{if(map.hasLayer(l))map.removeLayer(l);});b.textContent='Einsätze einblenden';b.style.background='#b80000';b.style.color='#fff';}else{b.textContent='Einsätze ausblenden';b.style.background='';b.style.color='';update();}}
// Einsatz-Nr Suche mit Vorschlagsliste (ab 2 Zeichen, max 10)
function getNrSearch(){return $('nrSearch').value.trim();}
function hideNrSugg(){$('nrSugg').style.display='none';}
function showNrSugg(){
  const q=getNrSearch();
  const box=$('nrSugg');
  if(q.length<2){hideNrSugg();return;}
  const matches=DATA.incidents.filter(i=>i.nr&&i.nr.includes(q)).slice(0,10);
  if(!matches.length){box.innerHTML='<div style="color:#888;cursor:default;font-style:italic;">Keine Treffer</div>';box.style.display='block';return;}
  box.innerHTML=matches.map(i=>{
    const meta=[i.dt,i.sw,i.ort].filter(Boolean).join(' · ');
    return '<div data-nr="'+i.nr+'"><b>'+i.nr+'</b><div class="nr-meta">'+meta+'</div></div>';
  }).join('');
  box.style.display='block';
  box.querySelectorAll('div[data-nr]').forEach(el=>el.onclick=function(){
    $('nrSearch').value=this.dataset.nr;
    hideNrSugg();
    update();
  });
}
$('nrSearch').oninput=()=>{showNrSugg();update();$('nrSearchClear').style.display=$('nrSearch').value?'block':'none';};
$('nrSearch').onfocus=()=>showNrSugg();
$('nrSearch').onblur=()=>setTimeout(hideNrSugg,200); // Delay für Klick-Erfassung
$('nrSearchClear').onclick=function(){const i=$('nrSearch');i.value='';hideNrSugg();update();$('nrSearchClear').style.display='none';i.focus();};
document.addEventListener('click',e=>{if(!e.target.closest('#nrSearch')&&!e.target.closest('#nrSugg'))hideNrSugg();});
const filtered=()=>{
  const nr=getNrSearch();
  if(nr) return DATA.incidents.filter(i=>i.nr&&i.nr.includes(nr));
  return DATA.incidents.filter(i=>selOrt().has(i.ort)&&selSt().has(i.st)&&selSW().has(i.sw)&&selYR().has(i.yr));
};
const popup=function(i){
  return '<div style="font-family:sans-serif;font-size:12px;min-width:220px;">'
    +'<table style="border-collapse:collapse;width:100%">'
    +'<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap">Stichwort</td>'
    +    '<td style="font-weight:600;color:#1a1a1a">'+i.sw+'</td></tr>'
    +'<tr><td style="color:#666;padding:2px 8px 2px 0">Adresse</td>'
    +    '<td>'+i.ad+(i.hn?' '+i.hn:'')+'</td></tr>'
    +'<tr><td style="color:#666;padding:2px 8px 2px 0">Stadtteil</td>'
    +    '<td>'+(i.st&&i.st!==i.ort?i.st+', ':'')+i.ort+'</td></tr>'
    +'<tr><td style="color:#666;padding:2px 8px 2px 0">Datum</td>'
    +    '<td>'+i.dt+'</td></tr>'
    +'<tr><td style="color:#666;padding:2px 8px 2px 0">Jahr</td>'
    +    '<td>'+i.yr+'</td></tr>'
    +'<tr><td style="color:#666;padding:2px 8px 2px 0">Einsatz-Nr.</td>'
    +    '<td style="font-size:11px;color:#555">'+i.nr+'</td></tr>'
    +(i.ob?'<tr><td style="color:#666;padding:2px 8px 2px 0">Objekt</td><td>'+i.ob+'</td></tr>':'')
    +'</table>'
    +'</div>';
};
function pip(pt,poly){let x=pt[0],y=pt[1],ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){let xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins;}return ins;}
// BBox-Index einmalig vorberechnen fuer schnellen covered()-Check
const isoBBox=(()=>{
  const idx={};
  DATA.isochrones.features.forEach(f=>{
    const pr=f.properties;if(!pr.profile)return;
    const key=pr.profile+'|'+pr.minutes+'|'+pr.station_name;
    const g=f.geometry;
    const rings=(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(p=>p[0]);
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    rings.forEach(r=>r.forEach(([x,y])=>{if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}));
    idx[key]={bbox:[x0,y0,x1,y1],rings};
  });
  return idx;
})();
// Beurteilungsrelevante Stichworte (VA REK V1.2 Anlage 1)
// Beurteilungsrelevante Stichworte VA REK V1.2 Anlage 1 (nach Bezeichnung)
const BEURT_SW=new Set(['explosion', 'explosion-mig', 'flug 2', 'flug2', 'flüchtlingsunterkunft', 'gebäude', 'gebäude-mig', 'industrie', 'industrie-mig', 'lagerhalle', 'lagerhalle-mig', 'landwirtschaft', 'landwirtschaft-mig', 'p-bau', 'p-eingeklemmt', 'p-lkw', 'p-tuer', 'p-tür', 'schule', 'schule-mig', 'sonderobjekt', 'sonderobjekt-mig', 'th-bahn', 'vu-bus', 'vu-mit']);
function swRelevant(sw){return BEURT_SW.has((sw||'').toLowerCase().trim());}
function covered(i){
  // Zeitstufen aus Checkboxen: größte aktive = Prüfzeit
  const t=maxT();
  if(!t)return null; // keine Stufe aktiv → kein Check möglich
  const p=$('prof').value;
  const lon=i.lon,lat=i.lat;
  // Nur ausgewählte Wachen prüfen
  for(const f of DATA.isochrones.features){
    const pr=f.properties;
    if(!pr.profile||pr.profile!==p||pr.minutes>t)continue;
    const w=wMarkers.find(x=>x.isoSet.has(pr.station_name));
    if(!w||!w.on)continue;
    const entry=isoBBox[p+'|'+pr.minutes+'|'+pr.station_name];
    if(!entry)continue;
    const [bx0,by0,bx1,by1]=entry.bbox;
    if(lon<bx0||lon>bx1||lat<by0||lat>by1)continue;
    for(const ring of entry.rings)if(pip([lon,lat],ring))return true;
  }
  return false;
}

let _covTimer=null;
function update(){
  [cl,pts,heat,unc,heatClick].forEach(l=>map.removeLayer(l));
  if(window.einsHidden)return;
  cl=L.markerClusterGroup();pts=L.layerGroup();unc=L.layerGroup();heatClick=L.layerGroup();
  const fi=filtered();const heatPts=[];
  const mode=$('mode').value;
  fi.forEach(i=>{
    if(mode==='cluster')cl.addLayer(L.marker([i.lat,i.lon]).bindPopup(popup(i)));
    else if(mode==='points')pts.addLayer(L.circleMarker([i.lat,i.lon],{radius:4,color:'#1976d2',fillOpacity:.7}).bindPopup(popup(i)));
    heatPts.push([i.lat,i.lon,1]);
  });
  if(mode==='cluster')cl.addTo(map);
  if(mode==='points')pts.addTo(map);
  if(mode==='heat'){
    heat=L.heatLayer(heatPts,{radius:+$('hr').value,blur:18,minOpacity:0.4,maxZoom:11,gradient:{0.0:'rgba(70,180,255,0)',0.2:'#46b4ff',0.4:'#00e0ff',0.55:'#7cff3c',0.7:'#ffe600',0.85:'#ff7a00',1.0:'#b80000'}}).addTo(map);
    map._heatFi=fi;
  }
  unc.addTo(map);
  const fiRel=fi.filter(i=>swRelevant(i.sw));$('tc').textContent=fiRel.length;$('nc').textContent='…';$('qt').textContent='…';
  if(_covTimer)clearTimeout(_covTimer);
  _covTimer=setTimeout(()=>{
    // Kein Check wenn keine Zeitstufe oder keine Wache aktiv
    if(!maxT()){
      $('nc').textContent='–';
      $('qt').textContent='Zeitstufe wählen';
      return;
    }
    if(!wMarkers.some(w=>w.on)){
      $('nc').textContent='–';
      $('qt').textContent='Wache(n) wählen';
      return;
    }
    let nc=0;
    // Kompaktes Popup-Rendering OHNE Jahr (Bug 10)
    function _popupKompakt(i){
      return '<table style="border-collapse:collapse;width:100%;font-size:12px">'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0;white-space:nowrap">Stichwort</td>'
        +    '<td style="font-weight:600;color:#1a1a1a">'+i.sw+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Adresse</td>'
        +    '<td>'+i.ad+(i.hn?' '+i.hn:'')+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Stadtteil</td>'
        +    '<td>'+(i.st&&i.st!==i.ort?i.st+', ':'')+i.ort+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Datum</td>'
        +    '<td>'+i.dt+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Einsatz-Nr.</td>'
        +    '<td style="color:#1a1a1a">'+i.nr+'</td></tr>'
        +(i.ob?'<tr><td style="color:#666;padding:2px 8px 2px 0">Objekt</td><td>'+i.ob+'</td></tr>':'')
        +'</table>';
    }
    fiRel.forEach(i=>{
      if(covered(i)===false){nc++;
        unc.addLayer(L.circleMarker([i.lat,i.lon],{radius:5,color:'#e63946',fillColor:'#e63946',fillOpacity:.9}).bindPopup(function(){
  const hfMin = parseInt(document.getElementById('hfMin')?.value||'8');
  return '<div style="font-family:sans-serif;font-size:12px;min-width:260px;">'
    +'<div style="background:#c0392b;color:#fff;padding:6px 10px;margin:-1px -1px 8px -1px;'
    +'border-radius:3px 3px 0 0;font-weight:700;font-size:12px;letter-spacing:0.3px;">'
    +'Nicht abgedeckter Einsatz</div>'
    +'<div style="color:#c0392b;font-size:11px;margin-bottom:8px;padding:0 2px;">'
    +'Einsatz in der Isochrone '+hfMin+' Min nicht abgedeckt.</div>'
    + _popupKompakt(i)
    +'<div style="margin-top:8px;padding:5px 6px;background:#f8f8f8;border-left:3px solid #2980b9;'
    +'font-size:10.5px;color:#555;line-height:1.4;">'
    +'Für detaillierte Hilfsfristanalyse: Reiter „Hilfsfrist"'
    +'</div></div>';
}));
      }
    });
    $('nc').textContent=nc;
    $('qt').textContent=fiRel.length?((1-nc/fiRel.length)*100).toFixed(1)+'%':'–';
  },200);
  const grp={};fi.forEach(i=>{const k=i.sw+'|'+i.ort+'|'+i.ad+'|'+i.hn;grp[k]=(grp[k]||0)+1;});
  const top=Object.entries(grp).filter(([,c])=>c>=3).sort((a,b)=>b[1]-a[1]).slice(0,10);
  $('top10').innerHTML=top.map(([k,c])=>{const p=k.split('|');return '<li><b>'+c+'×</b> '+p[0]+' – '+p[2]+' '+p[3]+', '+p[1]+'</li>';}).join('');
}

['mode'].forEach(id=>$(id).oninput=update);
$('hr').oninput=function(){$('hrV').textContent=this.value;update();};
['prof','op'].forEach(id=>$(id).oninput=()=>{const v=$(id+'V');if(v)v.textContent=$(id).value;refreshIso();update();});
document.querySelectorAll('.tc').forEach(c=>c.onchange=()=>{refreshIso();update();});
$('showGap').onchange=refreshIso;
$('showBorder').onchange=refreshIso;
['hr','op'].forEach(id=>{const v=$(id+'V');if(v)v.textContent=$(id).value;});
// Heatmap-Klick: globaler Handler ohne Marker-Overhead
map.on('click',function(e){
  if(window._measureActive)return; // Messwerkzeug hat Vorrang
  if($('mode').value!=='heat'||!map._heatFi)return;
  const R_M=150; // Meter Umkreis
  const R_DEG=R_M/111320;
  const clat=e.latlng.lat, clon=e.latlng.lng;
  const cosLat=Math.cos(clat*Math.PI/180)||1;
  const near=map._heatFi.filter(j=>
    Math.abs(j.lat-clat)<R_DEG && Math.abs(j.lon-clon)<R_DEG/cosLat
  );
  if(!near.length)return;
  const total=near.length;

  // ── Top 10 Stichworte ───────────────────────────────────────────────────
  const grp={};near.forEach(j=>{grp[j.sw]=(grp[j.sw]||0)+1;});
  const top10=Object.entries(grp).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const maxSw=top10[0]?top10[0][1]:1;
  const swRows=top10.map(([k,c])=>{
    const w=Math.round(c/maxSw*60);
    return '<tr>'
      +'<td style="padding:2px 5px 2px 0;font-size:11px;white-space:nowrap;color:#333">'+k+'</td>'
      +'<td style="padding:2px 3px;"><div style="height:8px;width:'+w+'px;background:#2b6cb0;'
      +'border-radius:2px;min-width:2px"></div></td>'
      +'<td style="padding:2px 0 2px 4px;font-size:11px;font-weight:600;color:#444">'+c+'×</td>'
      +'</tr>';
  }).join('');

  // ── Wochentage ──────────────────────────────────────────────────────────
  const wdN=['So','Mo','Di','Mi','Do','Fr','Sa'];
  const wdC=[0,0,0,0,0,0,0];
  near.forEach(j=>{
    if(!j.dt)return;
    const p=j.dt.split('.');
    if(p.length>=3){try{const d=new Date(+p[2],+p[1]-1,+p[0]);if(!isNaN(d))wdC[d.getDay()]++;}catch(e){}}
  });
  const maxWd=Math.max(...wdC,1);
  const wdBars=wdN.map((d,i)=>{
    const h=Math.max(Math.round(wdC[i]/maxWd*32),wdC[i]>0?2:0);
    const hot=wdC[i]===Math.max(...wdC)&&wdC[i]>0;
    return '<div style="display:inline-block;text-align:center;width:28px;margin:0 2px;">'
      +'<div style="height:'+h+'px;background:'+(hot?'#c05621':'#e0a070')+';border-radius:2px 2px 0 0;'
      +'margin-bottom:2px"></div>'
      +'<div style="font-size:9px;color:#888">'+d+'</div>'
      +'<div style="font-size:9px;font-weight:'+(hot?'700':'400')+';color:'+(hot?'#c05621':'#666')+'">'+wdC[i]+'</div>'
      +'</div>';
  }).join('');

  // ── Jahresvergleich ─────────────────────────────────────────────────────
  const yrC={};near.forEach(j=>{yrC[j.yr]=(yrC[j.yr]||0)+1;});
  const yrEntries=Object.entries(yrC).sort();
  const maxYr=Math.max(...Object.values(yrC),1);
  const yrRows=yrEntries.map(([yr,c])=>{
    const w=Math.round(c/maxYr*80);
    return '<tr><td style="color:#666;font-size:11px;padding:2px 5px 2px 0">'+yr+'</td>'
      +'<td><div style="height:8px;width:'+w+'px;background:#276749;border-radius:2px;min-width:2px"></div></td>'
      +'<td style="padding-left:5px;font-size:11px;font-weight:600">'+c+'</td></tr>';
  }).join('');

  // ── Popup HTML ──────────────────────────────────────────────────────────
  const html='<div style="font-family:sans-serif;font-size:12px;width:290px;max-height:440px;overflow-y:auto;">'

    // Header
    +'<div style="background:#2d3748;color:#fff;padding:7px 10px;margin:-1px -1px 8px -1px;border-radius:3px 3px 0 0;">'
    +'<div style="font-weight:700">Einsatzanalyse &ndash; Umkreis '+R_M+'\u00a0m</div>'
    +'<div style="font-size:10px;opacity:.75;margin-top:2px;">'+total+' Einsatz'+(total!==1?'e':'')+' erfasst</div>'
    +'</div>'

    // 1. Sonderobjekte & Infrastruktur (höchste Priorität)
    +'<div style="font-weight:700;color:#c05621;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">\u26a0\ufe0f Sonderobjekte &amp; Infrastruktur</div>'
    +'<div id="sobj-result-'+Math.round(clat*10000)+'" style="font-size:11px;color:#888;font-style:italic;margin-bottom:10px;">Wird geladen\u2026</div>'
    +'<div style="border-top:1px solid #eee;padding-top:8px;margin-bottom:8px;"></div>'

    // 2. Top 10 Stichworte
    +'<div style="font-weight:700;color:#444;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Top Stichworte</div>'
    +'<table style="border-collapse:collapse;width:100%;margin-bottom:10px">'+swRows+'</table>'

    // 3. Wochentage
    +'<div style="font-weight:700;color:#444;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Wochentagsverteilung</div>'
    +'<div style="display:flex;align-items:flex-end;height:50px;margin-bottom:18px;padding-left:2px;overflow:visible">'+wdBars+'</div>'

    // 4. Jahresvergleich
    +(yrRows?'<div style="font-weight:700;color:#444;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Jahresvergleich</div>'
      +'<table style="border-collapse:collapse;margin-bottom:8px">'+yrRows+'</table>':'')

    +'</div>';

  const popup=L.popup({maxWidth:310}).setLatLng(e.latlng).setContent(html).openOn(map);

  // ── Sonderobjekte via Overpass API ──────────────────────────────────────
  const rid='sobj-result-'+Math.round(clat*10000);
  const bbox=[clat-R_DEG*2, clon-(R_DEG*2)/cosLat, clat+R_DEG*2, clon+(R_DEG*2)/cosLat].map(x=>x.toFixed(6)).join(',');
  const query='[out:json][timeout:10];('
    +'node["amenity"~"hospital|clinic|school|kindergarten|pharmacy|police|fire_station|social_facility"]('+bbox+');'
    +'node["man_made"~"water_tower|water_works|power_substation"]('+bbox+');'
    +'node["power"~"substation|plant"]('+bbox+');'
    +'node["building"~"hospital|school"]('+bbox+');'
    +'way["amenity"~"hospital|clinic|school|kindergarten|pharmacy|police|fire_station"]('+bbox+');'
    +'way["building"~"hospital|school"]('+bbox+');'
    +');out center tags;';

  fetch('https://overpass-api.de/api/interpreter',{
    method:'POST',
    body:'data='+encodeURIComponent(query),
    headers:{'Content-Type':'application/x-www-form-urlencoded'}
  }).then(r=>r.json()).then(data=>{
    const el=document.getElementById(rid); if(!el)return;
    if(!data.elements||!data.elements.length){
      el.innerHTML='<span style="color:#555;font-style:normal">Keine bekannten Sonderobjekte oder kritische Infrastruktur im Umkreis.</span>'; return;
    }
    // Kategorisieren
    const SO_LBL={'hospital':'Krankenhaus','clinic':'Klinik','school':'Schule','kindergarten':'Kindertagesstätte','social_facility':'Sozialeinrichtung','police':'Polizei','fire_station':'Feuerwehr','pharmacy':'Apotheke','substation':'Umspannwerk','plant':'Kraftwerk','water_tower':'Wasserturm','water_works':'Wasserwerk'};
    const cats={'Krankenhaus & Kliniken':[],'Schulen & Kitas':[],'Blaulicht':[],'Soziales & Gesundheit':[],'Infrastruktur':[],'Sonstige':[]};
    data.elements.forEach(function(el){
      const t=el.tags||{};
      const raw=t.name||t['name:de']||'';
      const type=SO_LBL[t.amenity]||SO_LBL[t.man_made]||SO_LBL[t.power]||t.amenity||'';
      const name=raw||(type||'Unbenannt');
      const a=t.amenity||'',b=t.building||'',m=t.man_made||'',p=t.power||'';
      if(a==='hospital'||a==='clinic'||b==='hospital') cats['Krankenhaus & Kliniken'].push(name);
      else if(a==='school'||a==='kindergarten'||b==='school') cats['Schulen & Kitas'].push(name);
      else if(a==='police'||a==='fire_station') cats['Blaulicht'].push(name);
      else if(a==='pharmacy'||a==='social_facility') cats['Soziales & Gesundheit'].push(name);
      else if(m||p) cats['Infrastruktur'].push(name);
      else cats['Sonstige'].push(name);
    });
    const icons={'Krankenhaus & Kliniken':'','Schulen & Kitas':'','Blaulicht':'','Soziales & Gesundheit':'','Infrastruktur':'','Sonstige':''};
    let html2='';
    Object.entries(cats).forEach(function([cat,items]){
      if(!items.length)return;
      const uniq=[...new Set(items)].slice(0,5);
      html2+='<div style="margin-bottom:5px;">'
        +'<div style="font-size:10px;font-weight:700;color:#444;margin-bottom:2px;text-transform:uppercase;letter-spacing:.3px">'+cat+'</div>'
        +uniq.map(n=>'<div style="font-size:10.5px;color:#333;padding-left:10px">&bull; '+n+'</div>').join('')
        +(items.length>5?'<div style="font-size:10px;color:#999;padding-left:10px">+ '+(items.length-5)+' weitere</div>':'')
        +'</div>';
    });
    el.innerHTML=html2||'<span style="color:#888;font-style:italic">Keine Treffer</span>';
    el.style.fontStyle='normal'; el.style.color='#333';
  }).catch(function(){
    const el=document.getElementById(rid); 
    if(el) el.innerHTML='<span style="color:#888;font-style:italic">Sonderobjekte konnten nicht abgerufen werden.</span>';
  });
});
// ════════════════════════════════════════════════════════════════
// HILFSFRIST-LAYER
// ════════════════════════════════════════════════════════════════

// Dummy-Daten: 10 Kommunen × 5 Status × 10 = 500 Einträge
(function buildDummyHF(){
  var kom=[
    {name:'Bergheim',  lat:50.960,lon:6.640},{name:'Bedburg',   lat:50.990,lon:6.570},
    {name:'Elsdorf',   lat:50.930,lon:6.560},{name:'Erftstadt', lat:50.800,lon:6.780},
    {name:'Frechen',   lat:50.910,lon:6.800},{name:'Hürth',     lat:50.880,lon:6.860},
    {name:'Kerpen',    lat:50.870,lon:6.700},{name:'Pulheim',   lat:50.970,lon:6.800},
    {name:'Brühl',     lat:50.830,lon:6.910},{name:'Wesseling', lat:50.820,lon:6.980}
  ];
  var sts=[
    {raw:'beide_erfüllt',    hint:'Beide Hilfsfristen eingehalten'},
    {raw:'hf1_erfüllt',      hint:'Nur HF 1 eingehalten'},
    {raw:'hf2_erfüllt',      hint:'Nur HF 2 eingehalten'},
    {raw:'keine_erfüllt',    hint:'Keine Hilfsfrist erreicht'},
    {raw:'nicht_auswertbar', hint:'Datenlücke in Alarmierung'}
  ];
  var d={};
  kom.forEach(function(k,ki){
    sts.forEach(function(s,si){
      for(var i=0;i<10;i++){
        var nr='REK-2024-'+(240000+ki*50+si*10+i);
        d[nr]={status:normalizeHFStatus(s.raw),hinweis:s.hint,
               lat:k.lat+(Math.random()-.5)*.04,lon:k.lon+(Math.random()-.5)*.06,
               ort:k.name,sw:'DUMMY-Einsatz',dt:'01.01.2024',nr:nr,ad:'Teststraße',hn:''+(i+1)};
      }
    });
  });
  window._hfDummy=d;
})();

var hfData={},hfVisible=false;
var hfFilter={gruen:false,gelb:false,orange:false,rot:false,grau:false};
var hfLayer=L.layerGroup();
var HF_COL={gruen:'#2ecc71',gelb:'#f1c40f',orange:'#e67e22',rot:'#e74c3c',grau:'#95a5a6'};
var HF_LBL={gruen:'Beide HF erfüllt',gelb:'Nur HF 1 erfüllt',orange:'Nur HF 2 erfüllt',rot:'Keine HF erfüllt',grau:'Keine Auswertung möglich'};
var HF_TARGET=90;

function normalizeHFStatus(raw){
  if(!raw)return 'grau';
  var v=String(raw).trim().toLowerCase().replace(/ü/g,'ue').replace(/ä/g,'ae').replace(/ö/g,'oe');
  if(['beide_erfuellt','beide_erfüllt','2','ok','beide'].indexOf(v)>=0)return 'gruen';
  if(['hf1_erfuellt','hf1_erfüllt','1','hf1'].indexOf(v)>=0)return 'gelb';
  if(['hf2_erfuellt','hf2_erfüllt','hf2'].indexOf(v)>=0)return 'orange';
  if(['keine_erfuellt','keine_erfüllt','0','nok','keine'].indexOf(v)>=0)return 'rot';
  return 'grau';
}

function resolveStatus(raw){return raw;}



function toggleHFFilter(key){
  hfFilter[key]=!hfFilter[key];
  var row=document.getElementById('hfrow-'+key);
  if(row)row.classList.toggle('hf-active',hfFilter[key]);
  updateHFLayer();
}

function toggleHFLayer(){
  hfVisible=!hfVisible;
  var b=document.getElementById('toggleHF');
  if(hfVisible){
    hfLayer.addTo(map);
    if(b){b.textContent='HF-Layer ausblenden';b.style.background='#555';}
    updateHFLayer();
  }else{
    if(map.hasLayer(hfLayer))map.removeLayer(hfLayer);
    if(b){b.textContent='HF-Layer einblenden';b.style.background='#b80000';}
  }
}

function updateHFLayer(){
  hfLayer.clearLayers();
  if(!hfVisible)return;
  var src=Object.keys(hfData).length?hfData:window._hfDummy;
  if(!src)return;
  var counts={gruen:0,gelb:0,orange:0,rot:0,grau:0};
  var useDummy=!Object.keys(hfData).length;
  var entries=[];
  var selOrte=typeof selOrt==='function'?selOrt():null;
  if(useDummy){
    Object.values(window._hfDummy).forEach(function(e){
      if(!selOrte||selOrte.size===0||selOrte.has(e.ort))entries.push({inc:e,hf:e});
    });
  }else{
    var fi=typeof filtered==='function'?filtered():[];
    fi.forEach(function(inc){var hf=hfData[inc.nr];if(hf)entries.push({inc:inc,hf:hf});});
  }
  entries.forEach(function(e){
    var status=resolveStatus(e.hf.status);
    if(status===null)return;
    counts[status]++;
    if(!hfFilter[status])return;
    var col=HF_COL[status];
    var icon=L.divIcon({className:'',
      html:'<div style="width:11px;height:11px;border-radius:50%;background:'+col+';border:2px solid rgba(255,255,255,.9);box-shadow:0 0 5px '+col+'bb;"></div>',
      iconSize:[11,11],iconAnchor:[5,5]});
    var inc=e.inc;
    var ph='<b>'+(inc.sw||'')+'</b><br>'+(inc.ad||'')+' '+(inc.hn||'')+', '+(inc.ort||'')+'<br>'+(inc.dt||'')+'<br><br>'
      +'<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;background:'+col+'33;border:1px solid '+col+';">'+HF_LBL[status]+'</span>';
    if(e.hf.hinweis)ph+='<div style="margin-top:5px;padding:4px 7px;background:#fff3cd;border-left:3px solid #f0a500;border-radius:2px;font-size:11px;">'+e.hf.hinweis+'</div>';
    L.marker([inc.lat,inc.lon],{icon:icon}).bindPopup(ph).addTo(hfLayer);
  });
  // Zähler
  Object.keys(counts).forEach(function(k){var el=document.getElementById('hfcnt-'+k);if(el)el.textContent=counts[k];});
  // Erreichungsgrad: erfüllt = nur gruen, Basis = auswertbare (ohne grau)
  var ausw=counts.gruen+counts.gelb+counts.orange+counts.rot;
  var nausw=counts.grau;

}

// Startzähler für Dummy-Daten
(function(){
  var d=window._hfDummy;if(!d)return;
  var c={gruen:0,gelb:0,orange:0,rot:0,grau:0};
  Object.values(d).forEach(function(e){c[e.status]++;});
  Object.keys(c).forEach(function(k){var el=document.getElementById('hfcnt-'+k);if(el)el.textContent=c[k];});
})();
// ════════════════════════════════════════════════════════════════

// Globale Hilfsfunktionen für AAO
function aaoResetRoutes(){
  var layers = (window.aaoRouteLayers && window.aaoRouteLayers.length) ? window.aaoRouteLayers : [];
  if(!layers.length) return;
  // Alle Items deselektieren
  document.querySelectorAll('.aao-item').forEach(function(x){ x.classList.remove('sel'); });
  if(typeof map!=='undefined') map.closePopup();
  // Alle Routen wieder sichtbar + Originalstärke
  var bounds=null;
  layers.forEach(function(l,i){
    try{
      if(typeof map!=='undefined' && !map.hasLayer(l)) l.addTo(map);
      l.setStyle({opacity:0.85, weight:i<3?4:2.5});
      var b=l.getBounds();
      if(b && b.isValid()){
        if(!bounds) bounds=L.latLngBounds(b.getSouthWest(), b.getNorthEast());
        else bounds.extend(b);
      }
    } catch(e){}
  });
  // Auf Gesamtübersicht aller Routen zoomen
  try{
    if(bounds && bounds.isValid()) map.fitBounds(bounds,{padding:[60,60]});
  }catch(e){}
}

// AAO-Analyse
// ════════════════════════════════════════════════════════════════
(function(){
  var EINSATZ_IDX = {};
  DATA.incidents.forEach(function(e){ EINSATZ_IDX[String(e.nr)] = e; });

  window.STADTTEILE = {};
  DATA.incidents.forEach(function(e){
    if(!e.ort||!e.st||e.st===e.ort) return;
    if(!STADTTEILE[e.ort]) STADTTEILE[e.ort]=new Set();
    STADTTEILE[e.ort].add(e.st);
  });
  Object.keys(STADTTEILE).forEach(function(k){ STADTTEILE[k]=Array.from(STADTTEILE[k]).sort(); });

  var ORTSKERNE = {
    'Bedburg':   {lat:50.9858,lon:6.5744}, 'Bergheim':  {lat:50.9586,lon:6.6380},
    'Br\u00fchl':     {lat:50.8274,lon:6.9046}, 'Elsdorf':   {lat:50.9377,lon:6.5611},
    'Erftstadt': {lat:50.8025,lon:6.7877}, 'Frechen':   {lat:50.9108,lon:6.8147},
    'H\u00fcrth':     {lat:50.8745,lon:6.8757}, 'Kerpen':    {lat:50.8714,lon:6.6958},
    'Pulheim':   {lat:50.9980,lon:6.8037}, 'Wesseling': {lat:50.8333,lon:6.9769}
  };

  var ROUTE_COLORS = ['#276749','#2b6cb0','#c05621','#553c9a','#744210',
    '#2c7a7b','#97266d','#2d3748','#1a365d','#276749','#2b6cb0','#c05621',
    '#553c9a','#744210','#2c7a7b','#97266d','#2d3748','#1a365d','#276749','#2b6cb0'];

  var OSRM = [
    'https://router.project-osrm.org',
    'https://routing.openstreetmap.de/routed-car'
  ];

  var aaoProfile='lkw', aaoTargetMarker=null;
  window.aaoRouteLayers=window.aaoRouteLayers||[];
  var aaoRouteLayers=window.aaoRouteLayers;
  var aaoLastResults=[], aaoRoutesVisible=true;
  // Routing-Modus: 'unbekannt' | 'online' | 'offline'
  var aaoModus = 'unbekannt';

  // ── Isochronen-Index ─────────────────────────────────────────────────
  var isoIndex = {};
  var stationById = {};
  DATA.isochrones.features.forEach(function(f){
    var p=f.properties;
    if(p.feature_type==='station'){ stationById[p.station_id]={name:p.station_name,addr:p.address||''}; return; }
    if(p.feature_type!=='isochrone') return;
    var id=p.station_id, prof=p.profile, min=p.minutes;
    if(!isoIndex[id]) isoIndex[id]={};
    if(!isoIndex[id][prof]) isoIndex[id][prof]=[];
    isoIndex[id][prof].push({minutes:min, coords:f.geometry.coordinates});
  });
  Object.keys(isoIndex).forEach(function(id){
    Object.keys(isoIndex[id]).forEach(function(prof){
      isoIndex[id][prof].sort(function(a,b){ return a.minutes-b.minutes; });
    });
  });

  // ── Point-in-Polygon (Ray-Casting) ───────────────────────────────────
  function pointInPolygon(lon, lat, coords){
    var allRings=[];
    if(typeof coords[0][0]==='number'){ allRings=[coords]; }
    else if(typeof coords[0][0][0]==='number'){ allRings=coords; }
    else { coords.forEach(function(poly){ poly.forEach(function(ring){ allRings.push(ring); }); }); }
    var inside=false;
    for(var r=0;r<allRings.length;r++){
      var ring=allRings[r], j=ring.length-1;
      for(var i=0;i<ring.length;i++){
        var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
        if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)) inside=!inside;
        j=i;
      }
    }
    return inside;
  }

  function calcFahrzeit(lon, lat, stId, profile){
    var prof=profile.toUpperCase();
    var stufen=isoIndex[stId]&&isoIndex[stId][prof];
    if(!stufen||!stufen.length) return null;
    for(var i=0;i<stufen.length;i++){
      if(pointInPolygon(lon,lat,stufen[i].coords)) return stufen[i].minutes*60;
    }
    return null;
  }

  // ── OSRM Table API (ein Request für alle Wachen) ─────────────────────
  function aaoTable(target, wachen, epIdx){
    epIdx=epIdx||0;
    var coords=target.lon+','+target.lat;
    wachen.forEach(function(w){ coords+=';'+w.lon+','+w.lat; });
    var url=OSRM[epIdx]+'/table/v1/driving/'+coords+'?sources=0&annotations=duration,distance';
    return fetch(url,{signal:AbortSignal.timeout?AbortSignal.timeout(8000):undefined})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(d){
        if(!d.durations||!d.durations[0]) throw new Error('Keine Daten');
        return {durations:d.durations[0].slice(1), distances:(d.distances&&d.distances[0])?d.distances[0].slice(1):null};
      })
      .catch(function(err){
        if(epIdx+1<OSRM.length) return aaoTable(target,wachen,epIdx+1);
        throw err;
      });
  }

  // ── OSRM Route API (mit Geometrie) ───────────────────────────────────
  function aaoRoute(target, wache, epIdx){
    epIdx=epIdx||0;
    var url=OSRM[epIdx]+'/route/v1/driving/'+target.lon+','+target.lat+';'+wache.lon+','+wache.lat+'?overview=full&geometries=geojson';
    return fetch(url)
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(d){
        if(!d.routes||!d.routes.length) throw new Error('Keine Route');
        return {duration:d.routes[0].duration,distance:d.routes[0].distance,geometry:d.routes[0].geometry};
      })
      .catch(function(err){
        if(epIdx+1<OSRM.length) return aaoRoute(target,wache,epIdx+1);
        throw err;
      });
  }

  function aaoHav(lat1,lon1,lat2,lon2){
    var R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;
    var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*1000;
  }
  function aaoFmt(s,iso){
    if(s===null) return '> 15 Min';
    var m=Math.floor(s/60),sec=Math.round(s%60);
    var str=sec===0?m+' Min':m+' Min '+sec+' Sek';
    return iso?'\u2248 '+str:str; // ~ Zeichen bei Isochrone
  }
  function aaoDist(m){ return m>=1000?(m/1000).toFixed(1)+' km':Math.round(m)+' m'; }
  function aaoClearRoutes(){
    // WICHTIG: Array nicht ersetzen, sondern leeren - sonst zeigt window.aaoRouteLayers
    // weiterhin auf das alte Array und globale Funktionen wie aaoResetRoutes() finden
    // die Routen nicht mehr.
    aaoRouteLayers.forEach(function(l){ try{ map.removeLayer(l); }catch(e){} });
    aaoRouteLayers.length = 0;
  }

  function aaoSetStatus(msg,type){
    var el=document.getElementById('aaoStatus'); if(!el) return;
    el.textContent=msg; el.className='aao-status'+(type?' '+type:'');
  }

  function aaoUpdateModusHinweis(){
    var el=document.getElementById('aaoModusHinweis'); if(!el) return;
    if(aaoModus==='online'){
      el.style.background='#f0faf4'; el.style.borderColor='#48bb78';
      el.innerHTML='<b style="color:#276749">Online-Modus:</b> Echte Fahrstrecken und -zeiten via OSRM-Routing.';
    } else if(aaoModus==='offline'){
      el.style.background='#fffbeb'; el.style.borderColor='#f6ad55';
      el.innerHTML=''
        +'<b style="color:#744210">Offline-Modus – Isochronen-Schätzung</b>'
        +'<div style="margin-top:5px;line-height:1.5;">Der Routing-Server ist in diesem Netzwerk nicht erreichbar. '
        +'Fahrzeiten werden aus den eingebetteten Isochronen berechnet.</div>'
        +'<div style="margin-top:5px;padding:5px 7px;background:#fef3cd;border-radius:3px;font-size:10.5px;line-height:1.5;">'
        +'<b>Berechnungsmethode:</b><br>'
        +'• Isochronen 2–16 Min in 1-Min-Schritten, vorberechnet mit OSRM-Straßendaten<br>'
        +'• Die Fahrzeit entspricht der kleinsten Isochrone, in der der Einsatzort liegt<br>'
        +'• Alle Werte sind auf volle Minuten gerundet (≈) – kein Live-Routing'
        +'</div>'
        +'<div style="margin-top:4px;font-size:10.5px;color:#92400e;">'
        +'Tipp: Bei Internetzugang wird automatisch auf OSRM-Routing umgeschaltet.'
        +'</div>';
    } else {
      el.style.background='#f6f6f6'; el.style.borderColor='#ddd';
      el.innerHTML='Berechnet die n\u00e4chsten Wachen per Fahrzeitrouting. Bei fehlender Internetverbindung wird automatisch auf Isochronen-Sch\u00e4tzwerte umgeschaltet.';
    }
  }

  function aaoGeocode(query){
    return fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(query+', Rhein-Erft-Kreis, NRW')+'&format=json&limit=3&countrycodes=de',{headers:{'User-Agent':'REK-AAO/1.0'}})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(d){ if(!d.length) throw new Error('Adresse nicht gefunden. Bitte pr\u00e4ziser eingeben.'); return {lat:parseFloat(d[0].lat),lon:parseFloat(d[0].lon)}; })
      .catch(function(err){
        if(!err.message||err.message.indexOf('nicht gefunden')<0)
          throw new Error('Adresssuche nicht verf\u00fcgbar. Bitte Einsatznummer oder Ortskern verwenden.');
        throw err;
      });
  }

  // Modus-Umschaltung
  document.querySelectorAll('input[name="aaoMode"]').forEach(function(r){
    r.addEventListener('change',function(){
      document.getElementById('aao-inp-adr').style.display=(r.value==='adresse')?'block':'none';
      document.getElementById('aao-inp-ort').style.display=(r.value==='ortskern')?'block':'none';
      document.getElementById('aao-inp-nr').style.display=(r.value==='einsatz')?'block':'none';
      document.querySelectorAll('.aao-mode-opt').forEach(function(l){ l.classList.remove('active'); });
      r.closest('.aao-mode-opt').classList.add('active');
      aaoSetStatus('');
    });
  });
  document.getElementById('aaoAdrInput').addEventListener('keydown',function(e){ if(e.key==='Enter') window.aaoBerechnen(); });
  document.getElementById('aaoNrInput').addEventListener('keydown', function(e){ if(e.key==='Enter') window.aaoBerechnen(); });

  // Einsatznummer Autocomplete
  var nrInput=document.getElementById('aaoNrInput');
  var nrClear=document.getElementById('aaoNrClear');
  var nrSugg =document.getElementById('aaoNrSugg');
  function aaoShowNrSugg(){
    var q=nrInput.value.trim(); if(q.length<2){ nrSugg.style.display='none'; return; }
    var matches=DATA.incidents.filter(function(i){ return i.nr&&String(i.nr).includes(q); }).slice(0,10);
    if(!matches.length){ nrSugg.innerHTML='<div style="color:#888;cursor:default;font-style:italic;padding:5px 8px;">Keine Treffer</div>'; nrSugg.style.display='block'; return; }
    nrSugg.innerHTML=matches.map(function(i){ var meta=[i.dt,i.sw,i.ort].filter(Boolean).join(' \u00b7 ');
      return '<div data-nr="'+i.nr+'" style="padding:5px 8px;cursor:pointer;border-bottom:1px solid #eee;"><b>'+i.nr+'</b><div style="font-size:10.5px;color:#888;">'+meta+'</div></div>';
    }).join(''); nrSugg.style.display='block';
    nrSugg.querySelectorAll('div[data-nr]').forEach(function(el){
      el.addEventListener('mousedown',function(ev){
        ev.preventDefault(); nrInput.value=this.dataset.nr; nrSugg.style.display='none'; nrClear.style.display='block';
        var e=EINSATZ_IDX[this.dataset.nr];
        if(e){ var inf=document.getElementById('aaoEinsInfo'); inf.style.display='block';
          inf.innerHTML='<div class="lbl">Einsatznummer</div><div class="val">'+e.nr+'</div>'
            +'<div class="lbl">Ort / Adresse</div><div class="val">'+e.ort+', '+e.ad+' '+(e.hn||'')+'</div>'
            +'<div class="lbl">Stichwort</div><div class="val">'+e.sw+'</div>'
            +'<div class="lbl">Datum</div><div class="val">'+e.dt+'</div>'; }
      });
      el.addEventListener('mouseover',function(){ this.style.background='#f0f0f0'; });
      el.addEventListener('mouseout', function(){ this.style.background=''; });
    });
  }
  nrInput.addEventListener('input',function(){ aaoShowNrSugg(); nrClear.style.display=nrInput.value?'block':'none'; document.getElementById('aaoEinsInfo').style.display='none'; });
  nrInput.addEventListener('focus',aaoShowNrSugg);
  nrInput.addEventListener('blur',function(){ setTimeout(function(){ nrSugg.style.display='none'; },200); });
  document.addEventListener('click',function(ev){ if(!ev.target.closest('#aaoNrInput')&&!ev.target.closest('#aaoNrSugg')) nrSugg.style.display='none'; });

  window.aaoOrtChanged=function(){
    var ort=document.getElementById('aaoOrtSelect').value;
    var wrap=document.getElementById('aaoStadtteilWrap');
    var stSel=document.getElementById('aaoStadtteilSelect');
    if(!ort){ wrap.style.display='none'; return; }
    var st=(window.STADTTEILE&&window.STADTTEILE[ort])||[];
    stSel.innerHTML='<option value="">-- Ortskern der Stadt --</option>';
    st.forEach(function(s){ var o=document.createElement('option'); o.value=s; o.textContent=s; stSel.appendChild(o); });
    wrap.style.display=st.length?'block':'none';
  };
  window.aaoSetProfile=function(p){
    aaoProfile=p;
    document.getElementById('aao-btn-pkw').classList.toggle('active',p==='pkw');
    document.getElementById('aao-btn-lkw').classList.toggle('active',p==='lkw');
  };
  window.aaoClearField=function(id){
    document.getElementById(id).value='';
    if(id==='aaoNrInput'){ document.getElementById('aaoEinsInfo').style.display='none';
      if(nrClear) nrClear.style.display='none'; if(nrSugg) nrSugg.style.display='none'; }
  };

  // ── Offline-Berechnung per Isochronen ────────────────────────────────
  function calcOffline(target, count){
    var results=[];
    Object.keys(isoIndex).forEach(function(stId){
      var stInfo=stationById[stId]; if(!stInfo) return;
      var station=DATA.stations.find(function(s){ return s.name===stInfo.name; }); if(!station) return;
      var duration=calcFahrzeit(target.lon,target.lat,parseInt(stId),aaoProfile);
      var dist=aaoHav(target.lat,target.lon,station.lat,station.lon);
      results.push({name:station.name,lat:station.lat,lon:station.lon,adresse:station.adresse||'',
        duration:duration, distance:dist, isIso:true});
    });
    results.sort(function(a,b){
      if(a.duration===null&&b.duration===null) return a.distance-b.distance;
      if(a.duration===null) return 1; if(b.duration===null) return -1;
      return a.duration-b.duration;
    });
    return results.slice(0,count);
  }

  // ── Hauptfunktion ─────────────────────────────────────────────────────
  window.aaoBerechnen=function(){
    var btn=document.getElementById('aaoCalcBtn');
    btn.disabled=true; aaoSetStatus('Berechnung l\u00e4uft\u2026');
    aaoClearRoutes();
    document.getElementById('aaoResults').innerHTML='';
    document.getElementById('aaoToggleBtn').style.display='none';
    var _sa=document.getElementById('aaoShowAllBtn'); if(_sa) _sa.style.display='none';

    var mode=document.querySelector('input[name="aaoMode"]:checked').value;
    var count=parseInt(document.getElementById('aaoCount').value);
    var getTarget;

    if(mode==='adresse'){
      var q=document.getElementById('aaoAdrInput').value.trim();
      if(!q){ aaoSetStatus('Bitte eine Adresse eingeben','err'); btn.disabled=false; return; }
      aaoSetStatus('Adresse wird gesucht\u2026'); getTarget=aaoGeocode(q);
    } else if(mode==='ortskern'){
      var ort=document.getElementById('aaoOrtSelect').value;
      if(!ort){ aaoSetStatus('Bitte eine Stadt w\u00e4hlen','err'); btn.disabled=false; return; }
      var st=document.getElementById('aaoStadtteilSelect').value;
      getTarget=st?aaoGeocode(st+', '+ort):Promise.resolve(ORTSKERNE[ort]);
    } else {
      var nr=nrInput.value.trim();
      if(!nr){ aaoSetStatus('Bitte Einsatznummer eingeben','err'); btn.disabled=false; return; }
      var e=EINSATZ_IDX[nr]; if(!e){ aaoSetStatus('Einsatznummer nicht gefunden','err'); btn.disabled=false; return; }
      getTarget=Promise.resolve({lat:e.lat,lon:e.lon});
    }

    getTarget.then(function(target){
      if(!target) throw new Error('Standort nicht gefunden');

      // Zielmarker
      if(aaoTargetMarker) map.removeLayer(aaoTargetMarker);
      var tIcon=L.divIcon({className:'',html:'<div style="width:14px;height:14px;background:#c8102e;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(200,16,46,0.6)"></div>',iconSize:[14,14],iconAnchor:[7,7]});
      aaoTargetMarker=L.marker([target.lat,target.lon],{icon:tIcon,zIndexOffset:2000}).addTo(map);
      aaoTargetMarker.bindTooltip('Einsatzort',{direction:'top'});

      // Luftlinie-Vorfilter
      var allW=DATA.stations.map(function(w){
        return {name:w.name,lat:w.lat,lon:w.lon,adresse:w.adresse||'',lft:aaoHav(target.lat,target.lon,w.lat,w.lon)};
      }).sort(function(a,b){ return a.lft-b.lft; }).slice(0,Math.min(count*3,30));

      aaoSetStatus('Routing-Server wird kontaktiert\u2026');

      // ── VERSUCH 1: Online per OSRM Table ─────────────────────────────
      return aaoTable(target, allW)
        .then(function(table){
          // Online erfolgreich
          var ranked=allW.map(function(w,i){
            return {name:w.name,lat:w.lat,lon:w.lon,adresse:w.adresse,
              duration:table.durations[i]||99999,
              distance:table.distances?table.distances[i]:w.lft,
              isIso:false};
          }).filter(function(w){ return w.duration<99999; })
            .sort(function(a,b){ return a.duration-b.duration; })
            .slice(0,count);

          aaoSetStatus('Routen werden geladen\u2026');

          // Echte Routen mit Geometrie für Top-N
          return Promise.all(ranked.map(function(w){
            return aaoRoute(target,w)
              .then(function(r){ w.route=r; return w; })
              .catch(function(){
                w.route={duration:w.duration,distance:w.distance,
                  geometry:{type:'LineString',coordinates:[[target.lon,target.lat],[w.lon,w.lat]]}};
                return w;
              });
          })).then(function(results){
            aaoModus='online';
            return results;
          });
        })
        .catch(function(){
          // ── FALLBACK: Offline per Isochronen ─────────────────────────
          aaoSetStatus('Routing nicht verf\u00fcgbar \u2013 wechsle auf Isochronen\u2026');
          var results=calcOffline(target,count);
          // Gerade Linien als Routen
          results.forEach(function(w){
            w.route={duration:w.duration||0,distance:w.distance,
              geometry:{type:'LineString',coordinates:[[target.lon,target.lat],[w.lon,w.lat]]}};
          });
          aaoModus='offline';
          return results;
        })
        .then(function(results){
          aaoLastResults=results;
          aaoUpdateModusHinweis();

          // Routen einzeichnen
          aaoLastResults.forEach(function(w,i){
            var color=ROUTE_COLORS[i]||'#555';
            var style={color:color,weight:i<3?4:2.5,opacity:0.85};
            if(w.isIso) style.dashArray='6,4'; // gestrichelt bei Isochrone
            var layer=L.geoJSON(w.route.geometry,{style:style}).addTo(map);
            (function(ww,rank){ layer.on('click',function(){ aaoShowPopup(ww,rank); }); })(w,i+1);
            aaoRouteLayers.push(layer);
          });

          aaoRenderResults(aaoLastResults);
          map.setView([target.lat,target.lon],12);
          if(aaoModus==='online')
            aaoSetStatus(aaoLastResults.length+' Wachen \u2014 '+aaoProfile.toUpperCase()+' \u2014 Online','ok');
          else
            aaoSetStatus(aaoLastResults.length+' Wachen \u2014 '+aaoProfile.toUpperCase()+' \u2014 Offline (Isochronen)','ok');
          var tb=document.getElementById('aaoToggleBtn'); tb.style.display='block'; tb.textContent='Routen ausblenden'; aaoRoutesVisible=true;
          var sa=document.getElementById('aaoShowAllBtn'); if(sa) sa.style.display='block';
        });

    }).catch(function(err){
      aaoSetStatus(err.message||String(err),'err');
    }).finally(function(){ btn.disabled=false; });
  };

  function aaoRenderResults(results){
    var c=document.getElementById('aaoResults'); c.innerHTML='';
    results.forEach(function(w,i){
      var rc=i===0?'r1':i===1?'r2':i===2?'r3':'rn';
      var timeStr=aaoFmt(w.duration,w.isIso);
      var div=document.createElement('div'); div.className='aao-item';
      div.innerHTML='<div class="aao-rank '+rc+'">'+(i+1)+'</div>'
        +'<div style="flex:1;min-width:0;"><div class="aao-iname">'+w.name+'</div><div class="aao-iaddr">'+w.adresse+'</div></div>'
        +'<div class="aao-itime"><div class="t">'+timeStr+'</div><div class="d">'+aaoDist(w.route?w.route.distance:w.distance)+'</div></div>';
      (function(ww,rank,el){
        el.addEventListener('click',function(){
          // Alle Items abwählen
          document.querySelectorAll('.aao-item').forEach(function(x){ x.classList.remove('sel'); });
          el.classList.add('sel');
          // Alle Routen dimmen, nur diese hervorheben
          aaoRouteLayers.forEach(function(l,li){
            l.setStyle({opacity: li===(rank-1)?1:0.15, weight: li===(rank-1)?5:2});
          });
          // Karte auf Route zoomen
          try{ map.fitBounds(L.geoJSON(ww.route.geometry).getBounds(),{padding:[80,80]}); }catch(ex){}
          // Detail-Popup
          aaoShowDetailPopup(ww, rank);
        });
      })(w,i+1,div);
      c.appendChild(div);
    });
    // Klick außerhalb Reset
    document.getElementById('aaoResults').addEventListener('mouseleave',function(){});
  }

  function aaoShowDetailPopup(w, rank){
    var mid;
    try{ var c=w.route.geometry.coordinates; mid=c[Math.floor(c.length/2)]; }
    catch(e){ mid=[w.lon,w.lat]; }
    var timeStr=aaoFmt(w.duration,w.isIso);
    var methode=w.isIso?'Isochrone (≈ Schätzwert)':'OSRM-Routing (exakt)';
    L.popup({maxWidth:260,className:'aao-detail-popup'})
      .setLatLng([mid[1],mid[0]])
      .setContent(
        '<div style="font-family:sans-serif;font-size:12px;">'
        +'<div style="background:#276749;color:#fff;padding:6px 10px;margin:-1px -1px 8px -1px;border-radius:3px 3px 0 0;font-weight:700;">Rang '+rank+' — '+w.name+'</div>'
        +'<table style="border-collapse:collapse;width:100%">'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Adresse</td><td>'+w.adresse+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Fahrzeit</td><td style="font-weight:700;font-size:13px">'+timeStr+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Strecke</td><td>'+aaoDist(w.route?w.route.distance:w.distance)+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Profil</td><td>'+aaoProfile.toUpperCase()+'</td></tr>'
        +'<tr><td style="color:#666;padding:2px 8px 2px 0">Methode</td><td style="font-size:10.5px">'+methode+'</td></tr>'
        +'</table>'
        +'<div style="margin-top:8px;font-size:10.5px;color:#666;border-top:1px solid #eee;padding-top:6px;">'
        +'Route auf der Karte hervorgehoben. '
        +'<a href="#" onclick="event.stopPropagation();if(typeof map!==\'undefined\')map.closePopup();aaoResetRoutes();return false;" style="color:#2b6cb0;font-size:10.5px">Alle Routen anzeigen</a>'+'</div></div>'
      ).openOn(map);
  }

  function aaoShowPopup(w,rank){
    var coords=w.route.geometry.coordinates,mid=coords[Math.floor(coords.length/2)];
    var timeStr=aaoFmt(w.duration,w.isIso);
    var modusStr=w.isIso?'Isochrone (\u2248 Sch\u00e4tzwert)':'OSRM-Routing (exakt)';
    L.popup({maxWidth:260}).setLatLng([mid[1],mid[0]]).setContent(
      '<div class="aao-popup-title">'+w.name+'</div>'
      +'<div class="aao-popup-row"><span class="aao-popup-lbl">Adresse</span><span class="aao-popup-val">'+w.adresse+'</span></div>'
      +'<div class="aao-popup-row"><span class="aao-popup-lbl">Fahrzeit</span><span class="aao-popup-val">'+timeStr+'</span></div>'
      +'<div class="aao-popup-row"><span class="aao-popup-lbl">Strecke</span><span class="aao-popup-val">'+aaoDist(w.route?w.route.distance:w.distance)+'</span></div>'
      +'<div class="aao-popup-row"><span class="aao-popup-lbl">Profil</span><span class="aao-popup-val">'+aaoProfile.toUpperCase()+'</span></div>'
      +'<div class="aao-popup-row"><span class="aao-popup-lbl">Methode</span><span class="aao-popup-val">'+modusStr+'</span></div>'
      +'<div><span class="aao-popup-rank">Rang '+rank+' von '+aaoLastResults.length+'</span></div>'
    ).openOn(map);
  }

  window.aaoToggleRoutes=function(){
    var btn=document.getElementById('aaoToggleBtn');
    var sa=document.getElementById('aaoShowAllBtn');
    if(aaoRoutesVisible){
      (window.aaoRouteLayers||[]).forEach(function(l){ map.removeLayer(l); });
      btn.textContent='Routen einblenden';
      if(sa) sa.style.display='none';
    } else {
      (window.aaoRouteLayers||[]).forEach(function(l,i){
        l.addTo(map);
        l.setStyle({opacity:0.85, weight:i<3?4:2.5});
      });
      document.querySelectorAll('.aao-item').forEach(function(x){ x.classList.remove('sel'); });
      btn.textContent='Routen ausblenden';
      if(sa) sa.style.display='block';
    }
    aaoRoutesVisible=!aaoRoutesVisible;
  };

  window.aaoReset=function(){
    aaoClearRoutes();
    // Routen-Dimming zurücksetzen falls nötig
    aaoRouteLayers.forEach(function(l){ try{l.setStyle({opacity:0.85,weight:3});}catch(e){}});
    if(aaoTargetMarker){ map.removeLayer(aaoTargetMarker); aaoTargetMarker=null; }
    document.getElementById('aaoResults').innerHTML='';
    document.getElementById('aaoToggleBtn').style.display='none';
    var _sa2=document.getElementById('aaoShowAllBtn'); if(_sa2) _sa2.style.display='none';
    document.getElementById('aaoAdrInput').value='';
    nrInput.value=''; if(nrClear) nrClear.style.display='none'; if(nrSugg) nrSugg.style.display='none';
    document.getElementById('aaoEinsInfo').style.display='none';
    document.getElementById('aaoOrtSelect').value='';
    document.getElementById('aaoStadtteilWrap').style.display='none';
    aaoModus='unbekannt'; aaoUpdateModusHinweis();
    aaoSetStatus(''); aaoLastResults=[];
    // Bug 9: Karte auf Start-Ansicht zurückzoomen
    try{ map.setView([50.88,6.72],11); }catch(e){}
    try{ map.closePopup(); }catch(e){}
  };

  // Hinweis initial setzen
  aaoUpdateModusHinweis();

})();
// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════

// Nach Upload: Einsatz-relevante Anzeige aktualisieren
// Bug 3: Beim Start / nach Upload sind ALLE Filter leer.
// Der Nutzer wählt aktiv aus, was er sehen will.
// Kopplung: Wählt er eine Kommune, werden deren Stadtteile automatisch mitgewählt.
// Wählt er eine Kommune ab, werden deren Stadtteile automatisch mitabgewählt.
// ════════════════════════════════════════════════════════════════
// MESSWERKZEUG (Strecken & Flächen)
// ════════════════════════════════════════════════════════════════
(function(){
  var mode = null;           // 'distance' | 'area' | null
  var points = [];           // Live-Punkte [lat,lon]
  var tempPolyline = null;   // aktueller Messstrich
  var tempPolygon = null;    // aktuelles Messpolygon
  var tempMarkers = [];      // Eckpunkte
  var tempLabel = null;      // Live-Label (Entfernung/Fläche)
  var finishedLayers = [];   // Alle abgeschlossenen Messungen

  function haversine(a, b){
    var R = 6371000; // Meter
    var dLat = (b.lat-a.lat)*Math.PI/180;
    var dLon = (b.lng-a.lng)*Math.PI/180;
    var la1 = a.lat*Math.PI/180, la2 = b.lat*Math.PI/180;
    var x = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  }
  function totalDistance(pts){
    if(pts.length<2) return 0;
    var s=0;
    for(var i=1;i<pts.length;i++) s += haversine(pts[i-1], pts[i]);
    return s;
  }
  // Näherungsberechnung Fläche per sphärisches Exzess (gut genug für kleine Gebiete)
  function polygonArea(pts){
    if(pts.length<3) return 0;
    var R = 6371000;
    var sum = 0;
    for(var i=0;i<pts.length;i++){
      var p1 = pts[i];
      var p2 = pts[(i+1)%pts.length];
      sum += (p2.lng - p1.lng) * Math.PI/180 *
             (2 + Math.sin(p1.lat*Math.PI/180) + Math.sin(p2.lat*Math.PI/180));
    }
    return Math.abs(sum * R * R / 2);
  }
  function fmtDistance(m){
    if(m < 1000) return Math.round(m)+' m';
    return (m/1000).toFixed(m<10000 ? 2 : 1)+' km';
  }
  function fmtArea(sqm){
    if(sqm < 10000) return Math.round(sqm).toLocaleString('de-DE')+' m²';
    if(sqm < 1000000) return (sqm/10000).toFixed(2)+' ha';
    return (sqm/1000000).toFixed(2)+' km²';
  }
  function setStatus(msg){
    var el = document.getElementById('measureStatus');
    if(el) el.textContent = msg||'';
  }
  function showStopBtn(show){
    var el = document.getElementById('measureStopBtn');
    if(el) el.style.display = show ? 'block' : 'none';
  }

  function clearTemp(){
    if(tempPolyline){ map.removeLayer(tempPolyline); tempPolyline=null; }
    if(tempPolygon){ map.removeLayer(tempPolygon); tempPolygon=null; }
    if(tempLabel){ map.removeLayer(tempLabel); tempLabel=null; }
    tempMarkers.forEach(function(m){ map.removeLayer(m); });
    tempMarkers = [];
    points = [];
  }

  window.measureStart = function(m){
    measureStop(); // evtl. laufende Messung beenden
    mode = m;
    window._measureActive = true;
    points = [];
    map.getContainer().style.cursor = 'crosshair';
    try{ map.doubleClickZoom.disable(); }catch(e){}
    setStatus(mode==='distance' ? 'Klicke Punkte für die Strecke. Doppelklick beendet die Messung.' : 'Klicke Eckpunkte der Fläche. Doppelklick beendet die Messung.');
    showStopBtn(true);
  };

  window.measureStop = function(){
    if(!mode){ window._measureActive=false; return; }
    // Fertige Messung einfrieren (falls mindestens 2 Punkte)
    if(points.length >= 2){
      var color = mode==='distance' ? '#2b6cb0' : '#276749';
      var lineCoords = points.map(function(p){ return [p.lat, p.lng]; });
      var finLine;
      if(mode==='area' && points.length >= 3){
        finLine = L.polygon(lineCoords, {color:color, weight:2, fillColor:color, fillOpacity:0.15}).addTo(map);
      } else {
        finLine = L.polyline(lineCoords, {color:color, weight:3, opacity:0.85}).addTo(map);
      }
      // Label an letzter Position
      var last = points[points.length-1];
      var text;
      if(mode==='distance') text = fmtDistance(totalDistance(points));
      else text = fmtArea(polygonArea(points))+' / Umfang '+fmtDistance(totalDistance(points.concat([points[0]])));
      var label = L.marker(last, {
        icon: L.divIcon({
          className: '',
          html: '<div style="background:'+color+';color:#fff;padding:3px 7px;border-radius:3px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);">'+text+'</div>',
          iconAnchor: [0, 14]
        }),
        interactive: false
      }).addTo(map);
      finishedLayers.push({line: finLine, label: label});
    }
    clearTemp();
    mode = null;
    window._measureActive = false;
    map.getContainer().style.cursor = '';
    try{ map.doubleClickZoom.enable(); }catch(e){}
    setStatus('');
    showStopBtn(false);
  };

  window.measureClearAll = function(){
    measureStop();
    finishedLayers.forEach(function(l){
      try{ map.removeLayer(l.line); }catch(e){}
      try{ map.removeLayer(l.label); }catch(e){}
    });
    finishedLayers = [];
    setStatus('Alle Messungen entfernt.');
    setTimeout(function(){ setStatus(''); }, 2000);
  };

  function updateLive(){
    var color = mode==='distance' ? '#2b6cb0' : '#276749';
    var coords = points.map(function(p){ return [p.lat, p.lng]; });
    // Polyline/Polygon aktualisieren
    if(tempPolyline){ map.removeLayer(tempPolyline); tempPolyline=null; }
    if(tempPolygon){ map.removeLayer(tempPolygon); tempPolygon=null; }
    if(mode==='area' && points.length >= 3){
      tempPolygon = L.polygon(coords, {color:color, weight:2, dashArray:'4,3', fillColor:color, fillOpacity:0.12}).addTo(map);
    } else if(points.length >= 2){
      tempPolyline = L.polyline(coords, {color:color, weight:3, dashArray:'6,4', opacity:0.85}).addTo(map);
    }
    // Live-Label
    if(tempLabel){ map.removeLayer(tempLabel); tempLabel=null; }
    if(points.length >= 2){
      var text;
      if(mode==='distance') text = fmtDistance(totalDistance(points));
      else text = fmtArea(polygonArea(points));
      tempLabel = L.marker(points[points.length-1], {
        icon: L.divIcon({
          className: '',
          html: '<div style="background:'+color+';color:#fff;padding:3px 7px;border-radius:3px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);">'+text+'</div>',
          iconAnchor: [0, 14]
        }),
        interactive: false
      }).addTo(map);
    }
  }

  map.on('click', function(e){
    if(!mode) return;
    points.push(e.latlng);
    var marker = L.circleMarker(e.latlng, {
      radius: 4, color: '#fff', weight: 2,
      fillColor: mode==='distance' ? '#2b6cb0' : '#276749',
      fillOpacity: 1
    }).addTo(map);
    tempMarkers.push(marker);
    updateLive();
  });
  map.on('dblclick', function(e){
    if(mode){
      L.DomEvent.preventDefault(e.originalEvent);
      measureStop();
    }
  });
})();


// Nach Upload: Einsatz-relevante Anzeige aktualisieren
// ════════════════════════════════════════════════════════════════
// ALKIS Flurstücke (WMS-Overlay)
// ════════════════════════════════════════════════════════════════
let alkisLayer = null;
let alkisActive = false;
function toggleAlkis(on){
  alkisActive = on;
  var wrap = document.getElementById('alkisOpacityWrap');
  if(on){
    if(!alkisLayer){
      alkisLayer = L.tileLayer.wms('https://www.wms.nrw.de/geobasis/wms_nw_alkis', {
        layers: 'adv_alkis_flurstuecke',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        opacity: 0.7,
        attribution: 'Flurstücke: © Geobasis NRW'
      });
    }
    alkisLayer.addTo(map);
    if(wrap) wrap.style.display='block';
  } else {
    if(alkisLayer && map.hasLayer(alkisLayer)) map.removeLayer(alkisLayer);
    if(wrap) wrap.style.display='none';
  }
}
// ALKIS GetFeatureInfo: bei Klick auf Karte Flurstück-Infos vom WMS abrufen
map.on('click', function(e){
  if(!alkisActive || window._measureActive) return;
  if(map.getZoom() < 15) return;
  var latlng = e.latlng;
  var size = map.getSize();
  var point = map.latLngToContainerPoint(latlng);
  var bounds = map.getBounds();
  var sw = bounds.getSouthWest();
  var ne = bounds.getNorthEast();
  var bbox = sw.lat+','+sw.lng+','+ne.lat+','+ne.lng;
  var url = 'https://www.wms.nrw.de/geobasis/wms_nw_alkis'
    + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo'
    + '&LAYERS=adv_alkis_flurstuecke&QUERY_LAYERS=adv_alkis_flurstuecke'
    + '&STYLES='
    + '&INFO_FORMAT=text/html'
    + '&FEATURE_COUNT=1'
    + '&CRS=EPSG:4326'
    + '&BBOX='+bbox
    + '&WIDTH='+size.x+'&HEIGHT='+size.y
    + '&I='+Math.round(point.x)+'&J='+Math.round(point.y);
  fetch(url).then(function(r){ return r.text(); }).then(function(html){
    if(!html || html.trim().length < 50 || html.indexOf('ServiceException') >= 0) return;
    // HTML-Response parsen und relevante Felder extrahieren
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var rows = doc.querySelectorAll('tr');
    var data = {};
    rows.forEach(function(r){
      var cells = r.querySelectorAll('td, th');
      if(cells.length >= 2){
        var key = cells[0].textContent.replace(/[:]+$/,'').trim();
        var val = cells[1].textContent.replace(/[:]+$/,'').trim();
        if(key && val) data[key] = val;
      }
    });
    // Wenn nichts Relevantes gefunden → abbrechen
    if(!data['Flurstückskennzeichen'] && !data['Gemarkung']) return;
    // Fläche formatieren
    var flaeche = data['Amtliche Fläche in m²'] || data['Amtliche Fläche'] || '';
    if(flaeche){
      var fm = parseFloat(flaeche);
      if(!isNaN(fm)){
        flaeche = fm.toLocaleString('de-DE') + ' m²';
        if(fm >= 10000) flaeche += ' (' + (fm/10000).toFixed(2) + ' ha)';
      }
    }
    var content = '<div style="font-family:sans-serif;font-size:12px;min-width:260px;">'
      + '<div style="background:#2b6cb0;color:#fff;padding:6px 10px;margin:-1px -1px 8px -1px;border-radius:3px 3px 0 0;font-weight:700;font-size:12px;">Flurstück</div>'
      + '<table style="border-collapse:collapse;width:100%">'
      + (data['Flurstückskennzeichen'] ? '<tr><td style="color:#666;padding:3px 8px 3px 0;white-space:nowrap;vertical-align:top">Kennzeichen</td><td style="font-weight:600;color:#1a1a1a;padding:3px 0">'+data['Flurstückskennzeichen'].replace(/_+$/,'')+'</td></tr>' : '')
      + (data['Gemarkung'] ? '<tr><td style="color:#666;padding:3px 8px 3px 0">Gemarkung</td><td>'+data['Gemarkung']+'</td></tr>' : '')
      + (data['Flur'] ? '<tr><td style="color:#666;padding:3px 8px 3px 0">Flur</td><td>'+data['Flur']+'</td></tr>' : '')
      + (data['Gemeinde'] ? '<tr><td style="color:#666;padding:3px 8px 3px 0">Gemeinde</td><td>'+data['Gemeinde']+'</td></tr>' : '')
      + (flaeche ? '<tr><td style="color:#666;padding:3px 8px 3px 0">Fläche</td><td style="font-weight:600">'+flaeche+'</td></tr>' : '')
      + (data['Lagebezeichnung(verschlüsselt)'] ? '<tr><td style="color:#666;padding:3px 8px 3px 0;vertical-align:top">Lage</td><td>'+data['Lagebezeichnung(verschlüsselt)'].replace(/\(.*?\)/g,'').trim()+'</td></tr>' : '')
      + (data['Tatsächliche Nutzung/m²'] ? '<tr><td style="color:#666;padding:3px 8px 3px 0;vertical-align:top">Nutzung</td><td>'+data['Tatsächliche Nutzung/m²']+'</td></tr>' : '')
      + (data['Aktualität des Flurstückes'] ? '<tr><td style="color:#666;padding:3px 8px 3px 0">Stand</td><td style="font-size:11px;color:#888">'+data['Aktualität des Flurstückes']+'</td></tr>' : '')
      + '</table>'
      + '<div style="margin-top:6px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:4px;">Quelle: Geobasis NRW (ALKIS) · Datenlizenz DE Zero 2.0</div>'
      + '</div>';
    L.popup({maxWidth:340}).setLatLng(latlng).setContent(content).openOn(map);
  }).catch(function(err){});
});
(function(){
  var sl = document.getElementById('alkisOpacity');
  var lbl = document.getElementById('alkisOpacityLabel');
  if(sl){
    sl.addEventListener('input', function(){
      var v = parseInt(sl.value);
      if(lbl) lbl.textContent = v + '%';
      if(alkisLayer) alkisLayer.setOpacity(v/100);
    });
  }
})();

// ════════════════════════════════════════════════════════════════
// RETTUNGSWACHEN (Rettungsdienst-Reiter)
// ════════════════════════════════════════════════════════════════
(function(){
  if(!DATA.rett_wachen || !DATA.rett_wachen.length) return;
  var rwLayer = L.layerGroup();
  // Initial: alle Wachen "on" - erste Aktivierung zeigt direkt alle an
  var rwState = DATA.rett_wachen.map(function(w,i){ return {on:true, idx:i, w:w}; });

  function makeRwIcon(geplant){
    // Gleiches Format wie Feuerwachen-Icon (abgerundetes Quadrat mit Label)
    var size = 18;
    var fontSize = 9;
    var bg = geplant ? '#fff' : '#2b6cb0';
    var fg = geplant ? '#2b6cb0' : '#fff';
    var borderStyle = geplant ? '1.5px dashed #2b6cb0' : '1.5px solid #fff';
    return L.divIcon({
      className:'',
      html:'<div style="width:'+size+'px;height:'+size+'px;background:'+bg+';border:'+borderStyle+';'
          +'box-shadow:0 1px 3px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;'
          +'border-radius:2px;color:'+fg+';font-family:Arial,sans-serif;font-weight:bold;font-size:'+fontSize+'px;'
          +'letter-spacing:0.3px;line-height:1;">RW</div>',
      iconSize:[size,size],
      iconAnchor:[size/2,size/2]
    });
  }

  function popupHtml(w){
    var titel = w.kurz || w.name || 'Rettungswache';
    var kennung = [(w.reb ? 'REB '+w.reb : ''), (w.neb ? 'NEB '+w.neb : ''), (w.keb ? 'KEB '+w.keb : '')].filter(function(s){return s;}).join(' · ');
    var stadt = w.stadt || '';
    var stadtteil = w.stadtteil || '';
    var strasse = w.strasse || '';
    var plz = w.plz || '';
    return '<div style="font-family:sans-serif;font-size:12px;min-width:220px;">'
      + '<div style="font-weight:700;color:#2b6cb0;font-size:13px;margin-bottom:3px;">'+titel+'</div>'
      + (w.geplant ? '<div style="display:inline-block;padding:1px 6px;background:#fff3cd;border:1px solid #f0c040;border-radius:3px;font-size:10px;font-weight:600;color:#744210;margin-bottom:5px;">IN PLANUNG</div>' : '')
      + (stadt ? '<div style="color:#666;font-size:11px;margin-bottom:5px;">'+stadt+(stadtteil?' · '+stadtteil:'')+'</div>' : '')
      + (strasse ? '<div style="font-size:12px;">'+strasse+(plz?'<br>'+plz+' '+stadt:'')+'</div>' : '')
      + (kennung ? '<div style="margin-top:6px;font-size:10.5px;color:#555;">'+kennung+'</div>' : '')
      + (w.beschrift ? '<div style="margin-top:6px;padding:5px 7px;background:#fff8e6;border-left:3px solid #f0c040;font-size:10.5px;color:#6b5515;">'+w.beschrift+'</div>' : '')
      + '</div>';
  }

  // Liste aufbauen
  var listEl = document.getElementById('rwlist');
  if(listEl){
    DATA.rett_wachen.slice().map(function(w,i){ return {w:w,i:i}; })
      .sort(function(a,b){ return (a.w.kurz||a.w.name||'').localeCompare(b.w.kurz||b.w.name||''); })
      .forEach(function(entry){
        var l = document.createElement('label');
        l.style.display = 'block';
        l.innerHTML = '<input type="checkbox" class="rwc" data-i="'+entry.i+'" checked> '+(entry.w.kurz||entry.w.name||'Unbenannt')+(entry.w.geplant?' <span style="color:#b38700;font-size:10px;">(geplant)</span>':'');
        listEl.appendChild(l);
      });
  }

  function refreshRW(){
    rwLayer.clearLayers();
    var shown = document.getElementById('shRW') ? document.getElementById('shRW').checked : false;
    if(!shown) return;
    var showGepl = document.getElementById('shRWgeplant') ? document.getElementById('shRWgeplant').checked : false;
    rwState.forEach(function(s){
      if(s.w.geplant && !showGepl) return;
      if(!s.on) return;
      var m = L.marker([s.w.lat, s.w.lon], {icon: makeRwIcon(s.w.geplant), zIndexOffset:500});
      m.bindPopup(popupHtml(s.w), {maxWidth:300});
      rwLayer.addLayer(m);
    });
    if(!map.hasLayer(rwLayer)) rwLayer.addTo(map);
  }

  window.setAllRW = function(v){
    document.querySelectorAll('.rwc').forEach(function(c){ c.checked = v; rwState[+c.dataset.i].on = v; });
    refreshRW();
  };

  document.addEventListener('change', function(e){
    if(e.target && e.target.classList && e.target.classList.contains('rwc')){
      rwState[+e.target.dataset.i].on = e.target.checked;
      refreshRW();
    }
  });
  var shRW = document.getElementById('shRW');
  var shRWgeplant = document.getElementById('shRWgeplant');
  if(shRW) shRW.addEventListener('change', refreshRW);
  if(shRWgeplant) shRWgeplant.addEventListener('change', refreshRW);

  // Suchfeld
  var rwSearch = document.getElementById('rwSearch');
  var rwSearchClear = document.getElementById('rwSearchClear');
  if(rwSearch){
    rwSearch.addEventListener('input', function(){
      var q = rwSearch.value.toLowerCase();
      if(q && document.getElementById('rwDetails')) document.getElementById('rwDetails').open = true;
      document.querySelectorAll('#rwlist label').forEach(function(l){
        l.style.display = l.textContent.toLowerCase().includes(q) ? 'block' : 'none';
      });
      if(rwSearchClear) rwSearchClear.style.display = rwSearch.value ? 'block' : 'none';
    });
    if(rwSearchClear) rwSearchClear.addEventListener('click', function(){ rwSearch.value=''; rwSearch.dispatchEvent(new Event('input')); rwSearch.focus(); });
  }
})();

// ════════════════════════════════════════════════════════════════
// HiOrg / EE NRW (Katastrophenschutz-Reiter)
// ════════════════════════════════════════════════════════════════
(function(){
  if(!DATA.hiorg || !DATA.hiorg.length) return;
  var hiLayer = L.layerGroup();
  // Initial: alle "on"
  var hiState = DATA.hiorg.map(function(h,i){ return {on:true, idx:i, h:h}; });

  // Farbe je Organisation (nach Corporate-Farben)
  var ORG_COL = {
    'DRK':'#e30613','ASB':'#009a3d','MHD':'#c8102e','JUH':'#ffcc00','DLRG':'#f5af00','THW':'#003399'
  };
  function orgColor(org){ return ORG_COL[org] || '#555'; }

  function makeHiIcon(h){
    var col = orgColor(h.org);
    // Gleiches Format wie Feuerwachen-Icon (abgerundetes Quadrat mit Label)
    var label = h.org || '?';
    var size = label.length > 3 ? 24 : 20;
    var fontSize = label.length > 3 ? 7 : 9;
    return L.divIcon({
      className:'',
      html:'<div style="width:'+size+'px;height:'+size+'px;background:'+col+';border:1.5px solid #fff;'
          +'box-shadow:0 1px 3px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;'
          +'border-radius:2px;color:#fff;font-family:Arial,sans-serif;font-weight:bold;font-size:'+fontSize+'px;'
          +'letter-spacing:0.3px;line-height:1;">'+label+'</div>',
      iconSize:[size,size],
      iconAnchor:[size/2,size/2]
    });
  }
  function popupHtml(h){
    // EETE in Teile splitten (z.B. "EE 04/TE Fü/TE TeSi" → ["EE 04","TE Fü","TE TeSi"])
    var einheiten = (h.eete||'').split('/').map(function(s){return s.trim();}).filter(Boolean);
    var einheitenHtml = '';
    if(einheiten.length){
      einheitenHtml = '<div style="margin-top:8px;padding:6px 8px;background:#f6f8fc;border:1px solid #ddd;border-radius:3px;">'
        +'<div style="font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;color:#444;margin-bottom:4px;">Einheiten / Teileinheiten</div>'
        + einheiten.map(function(e){
          return '<div style="font-size:11.5px;color:#333;padding:1px 0;">• '+e+'</div>';
        }).join('')
        +'</div>';
    }
    return '<div style="font-family:sans-serif;font-size:12px;min-width:220px;">'
      + '<div style="font-weight:700;color:'+orgColor(h.org)+';font-size:13px;margin-bottom:3px;">'+h.org+'</div>'
      + '<div style="color:#666;font-size:11px;margin-bottom:5px;">'+h.ort+'</div>'
      + '<div style="font-size:12px;">'+h.strasse+' '+h.hausnr+'<br>'+h.plz+' '+h.ort+'</div>'
      + einheitenHtml
      + (h.fahrzeuge ? '<div style="margin-top:6px;padding:6px 8px;background:#fdf6ec;border:1px solid #f0c989;border-radius:3px;">'
        +'<div style="font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;color:#744210;margin-bottom:4px;">Fahrzeuge / Ausstattung</div>'
        +'<div style="font-size:11.5px;color:#333;">'+h.fahrzeuge+'</div></div>' : '')
      + '</div>';
  }
  var listEl = document.getElementById('hiorglist');
  if(listEl){
    DATA.hiorg.slice().map(function(h,i){ return {h:h,i:i}; })
      .sort(function(a,b){
        var la = a.h.org + ' ' + a.h.ort;
        var lb = b.h.org + ' ' + b.h.ort;
        return la.localeCompare(lb);
      })
      .forEach(function(entry){
        var l = document.createElement('label');
        l.style.display = 'block';
        l.innerHTML = '<input type="checkbox" class="hiorgc" data-i="'+entry.i+'" checked> '
          +'<span style="display:inline-block;background:'+orgColor(entry.h.org)+';color:#fff;padding:0 4px;border-radius:2px;font-size:10px;font-weight:700;margin-right:4px;">'+entry.h.org+'</span>'
          +entry.h.ort + ' <span style="color:#888;font-size:10px;">('+entry.h.eete+')</span>';
        listEl.appendChild(l);
      });
  }
  function refreshHi(){
    hiLayer.clearLayers();
    var on = document.getElementById('shHiorg') ? document.getElementById('shHiorg').checked : false;
    if(!on) return;
    hiState.forEach(function(s){
      if(!s.on) return;
      var m = L.marker([s.h.lat, s.h.lon], {icon: makeHiIcon(s.h), zIndexOffset:400});
      m.bindPopup(popupHtml(s.h), {maxWidth:260});
      hiLayer.addLayer(m);
    });
    if(!map.hasLayer(hiLayer)) hiLayer.addTo(map);
  }
  window.setAllHiorg = function(v){
    document.querySelectorAll('.hiorgc').forEach(function(c){ c.checked = v; hiState[+c.dataset.i].on = v; });
    refreshHi();
  };
  document.addEventListener('change', function(e){
    if(e.target && e.target.classList && e.target.classList.contains('hiorgc')){
      hiState[+e.target.dataset.i].on = e.target.checked;
      refreshHi();
    }
  });
  var shHiorg = document.getElementById('shHiorg');
  if(shHiorg) shHiorg.addEventListener('change', refreshHi);
  var hiorgSearch = document.getElementById('hiorgSearch');
  var hiorgSearchClear = document.getElementById('hiorgSearchClear');
  if(hiorgSearch){
    hiorgSearch.addEventListener('input', function(){
      var q = hiorgSearch.value.toLowerCase();
      if(q && document.getElementById('hiorgDetails')) document.getElementById('hiorgDetails').open = true;
      document.querySelectorAll('#hiorglist label').forEach(function(l){
        l.style.display = l.textContent.toLowerCase().includes(q) ? 'block' : 'none';
      });
      if(hiorgSearchClear) hiorgSearchClear.style.display = hiorgSearch.value ? 'block' : 'none';
    });
    if(hiorgSearchClear) hiorgSearchClear.addEventListener('click', function(){ hiorgSearch.value=''; hiorgSearch.dispatchEvent(new Event('input')); hiorgSearch.focus(); });
  }
})();

// ════════════════════════════════════════════════════════════════
// SIRENEN (Katastrophenschutz-Reiter)
// ════════════════════════════════════════════════════════════════
(function(){
  if(!DATA.sirenen || !DATA.sirenen.length) return;
  var sirLayer = L.layerGroup();
  var sirRadiusLayer = L.layerGroup();

  // Kommunen-Liste aufbauen
  var komSet = {};
  DATA.sirenen.forEach(function(s){ komSet[s.ort] = (komSet[s.ort]||0)+1; });
  var komList = Object.keys(komSet).sort();
  var aktiveKom = new Set(komList); // initial: alle aktiv

  var listEl = document.getElementById('sirenenKomList');
  if(listEl){
    komList.forEach(function(k){
      var l = document.createElement('label');
      l.style.display = 'block';
      l.innerHTML = '<input type="checkbox" class="sirenenKomC" value="'+k+'" checked> '+k+' <span style="color:#888;font-size:10px;">('+komSet[k]+')</span>';
      listEl.appendChild(l);
    });
  }
  var statEl = document.getElementById('sirenenStat');
  if(statEl) statEl.textContent = DATA.sirenen.length + ' Sirenen';

  function popupHtml(s){
    return '<div style="font-family:sans-serif;font-size:12px;min-width:220px;">'
      + '<div style="font-weight:700;color:#b80000;font-size:13px;margin-bottom:3px;">Sirene '+s.id+'</div>'
      + '<div style="color:#666;font-size:11px;margin-bottom:5px;">'+s.ort+(s.mobil?' · mobil':' · stationär')+'</div>'
      + '<table style="border-collapse:collapse;width:100%;font-size:11.5px;">'
      + '<tr><td style="color:#666;padding:2px 6px 2px 0">Adresse</td><td>'+s.strasse+' '+s.hausnr+'</td></tr>'
      + '<tr><td style="color:#666;padding:2px 6px 2px 0">Typ</td><td>'+(s.typ||'–')+'</td></tr>'
      + '<tr><td style="color:#666;padding:2px 6px 2px 0">Baujahr</td><td>'+(s.bauj||'–')+'</td></tr>'
      + '<tr><td style="color:#666;padding:2px 6px 2px 0">Hörradius</td><td><b>'+s.radius_m+' m</b></td></tr>'
      + '</table>'
      + (s.bez ? '<div style="margin-top:5px;font-size:10.5px;color:#555;font-style:italic;">'+s.bez+'</div>' : '')
      + '</div>';
  }

  function makeSirenIcon(){
    return L.divIcon({
      className:'',
      html:'<div style="width:10px;height:10px;background:#b80000;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(184,0,0,0.8);"></div>',
      iconSize:[10,10], iconAnchor:[5,5]
    });
  }

  function refreshSirenen(){
    sirLayer.clearLayers();
    sirRadiusLayer.clearLayers();
    var on = document.getElementById('shSirenen') ? document.getElementById('shSirenen').checked : false;
    if(!on) return;
    var onRadius = document.getElementById('shSirenenRadius') ? document.getElementById('shSirenenRadius').checked : false;
    DATA.sirenen.forEach(function(s){
      if(!aktiveKom.has(s.ort)) return;
      var m = L.marker([s.lat, s.lon], {icon: makeSirenIcon(), zIndexOffset:300});
      m.bindPopup(popupHtml(s), {maxWidth:280});
      sirLayer.addLayer(m);
      if(onRadius && s.radius_m > 0){
        var c = L.circle([s.lat, s.lon], {
          radius: s.radius_m,
          color:'#b80000', weight:0.5, fillColor:'#b80000', fillOpacity:0.08
        });
        sirRadiusLayer.addLayer(c);
      }
    });
    if(!map.hasLayer(sirLayer)) sirLayer.addTo(map);
    if(onRadius){
      if(!map.hasLayer(sirRadiusLayer)) sirRadiusLayer.addTo(map);
    } else if(map.hasLayer(sirRadiusLayer)){
      map.removeLayer(sirRadiusLayer);
    }
  }

  window.setAllSirenenKom = function(v){
    document.querySelectorAll('.sirenenKomC').forEach(function(c){ c.checked = v; });
    aktiveKom = new Set();
    if(v) komList.forEach(function(k){ aktiveKom.add(k); });
    refreshSirenen();
  };
  document.addEventListener('change', function(e){
    if(e.target && e.target.classList && e.target.classList.contains('sirenenKomC')){
      if(e.target.checked) aktiveKom.add(e.target.value);
      else aktiveKom.delete(e.target.value);
      refreshSirenen();
    }
  });
  var shSir = document.getElementById('shSirenen');
  var shSirR = document.getElementById('shSirenenRadius');
  if(shSir) shSir.addEventListener('change', refreshSirenen);
  if(shSirR) shSirR.addEventListener('change', refreshSirenen);
})();

// ════════════════════════════════════════════════════════════════
// SONDEROBJEKTE
// ════════════════════════════════════════════════════════════════
(function(){
  if(!DATA.sonderobjekte||!DATA.sonderobjekte.length)return;
  var soLayer=L.layerGroup();
  var SO=DATA.sonderobjekte;
  var aktiveKat=new Set(), aktiveStadt=new Set();
  // Kategorien + Städte
  var kats={}, staedte={};
  SO.forEach(function(s){ kats[s.kat]=(kats[s.kat]||0)+1; staedte[s.stadt]=(staedte[s.stadt]||0)+1; });
  var katList=Object.keys(kats).sort(), stadtList=Object.keys(staedte).sort();
  katList.forEach(function(k){aktiveKat.add(k);}); stadtList.forEach(function(k){aktiveStadt.add(k);});
  // Icons je Kategorie
  var KAT_COL={'Krankenhaus':'#e74c3c','Klinik':'#c0392b','Pflegeheim':'#8e44ad','Hospiz':'#9b59b6',
    'Schule':'#2980b9','Schwimmbad':'#1abc9c','Industrieobjekt':'#7f8c8d','Störfallbetrieb':'#c0392b',
    'Kritische Infrastruktur':'#e67e22','Versammlungsstaette':'#f39c12','Kino':'#f1c40f',
    'Fluechtlingsunterkunft':'#16a085','Obdachlosenunterkunft':'#27ae60','Behinderteneinrichtung':'#2ecc71',
    'Tagespflege':'#3498db','Labor':'#95a5a6','Heimbeatmung':'#d35400','Psychiatrie':'#8e44ad',
    'WfbM':'#34495e','Erftverband':'#2c3e50','Sonstiges':'#7f8c8d'};
  function soIcon(s){
    var col=KAT_COL[s.kat]||'#7f8c8d';
    var isSF=s.kat==='Störfallbetrieb';
    var sz=isSF?12:8;
    var shape=isSF?'border-radius:1px;':'border-radius:50%;';
    return L.divIcon({className:'',
      html:'<div style="width:'+sz+'px;height:'+sz+'px;background:'+col+';border:1.5px solid #fff;'+shape+'box-shadow:0 0 3px rgba(0,0,0,0.5);"></div>',
      iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]});
  }
  function soPopup(s){
    return '<div style="font-family:sans-serif;font-size:12px;min-width:240px;">'
      +'<div style="background:'+(KAT_COL[s.kat]||'#7f8c8d')+';color:#fff;padding:6px 10px;margin:-1px -1px 6px -1px;border-radius:3px 3px 0 0;font-weight:700;font-size:12px;">'+s.kat+'</div>'
      +'<div style="font-weight:600;font-size:13px;color:#222;margin-bottom:4px;">'+s.name+'</div>'
      +(s.info?'<div style="font-size:11px;color:#555;margin-bottom:4px;">'+s.info+'</div>':'')
      +'<table style="border-collapse:collapse;width:100%;font-size:11.5px;">'
      +'<tr><td style="color:#666;padding:2px 6px 2px 0">Adresse</td><td>'+s.strasse+'<br>'+s.plz+' '+s.ort+'</td></tr>'
      +(s.tel?'<tr><td style="color:#666;padding:2px 6px 2px 0">Telefon</td><td>'+s.tel+'</td></tr>':'')
      +(s.web?'<tr><td style="color:#666;padding:2px 6px 2px 0">Web</td><td><a href="'+(s.web.startsWith('http')?s.web:'https://'+s.web)+'" target="_blank" style="color:#2b6cb0">'+s.web+'</a></td></tr>':'')
      +(s.plaetze?'<tr><td style="color:#666;padding:2px 6px 2px 0">Plätze/Betten</td><td>'+s.plaetze+'</td></tr>':'')
      +(s.hinweis?'<tr><td style="color:#666;padding:2px 6px 2px 0">Hinweis</td><td>'+s.hinweis+'</td></tr>':'')
      +'</table></div>';
  }
  // Filter-Listen aufbauen
  var klEl=document.getElementById('sobjKatList'), slEl=document.getElementById('sobjStadtList');
  if(klEl) katList.forEach(function(k){
    var l=document.createElement('label');l.style.display='block';
    l.innerHTML='<input type="checkbox" class="sobjKatC" value="'+k+'" checked> <span style="display:inline-block;width:8px;height:8px;background:'+(KAT_COL[k]||'#888')+';border-radius:50%;margin-right:4px;"></span>'+k+' <span style="color:#888;font-size:10px;">('+kats[k]+')</span>';
    klEl.appendChild(l);
  });
  if(slEl) stadtList.forEach(function(k){
    var l=document.createElement('label');l.style.display='block';
    l.innerHTML='<input type="checkbox" class="sobjStadtC" value="'+k+'" checked> '+k+' <span style="color:#888;font-size:10px;">('+staedte[k]+')</span>';
    slEl.appendChild(l);
  });
  var totalEl=document.getElementById('sobjTotal');if(totalEl)totalEl.textContent=SO.length;
  function refreshSObj(){
    soLayer.clearLayers();
    if(!document.getElementById('shSObj')||!document.getElementById('shSObj').checked)return;
    var n=0;
    SO.forEach(function(s){
      if(!aktiveKat.has(s.kat)||!aktiveStadt.has(s.stadt))return;
      n++;
      soLayer.addLayer(L.marker([s.lat,s.lon],{icon:soIcon(s),zIndexOffset:200}).bindPopup(soPopup(s),{maxWidth:320}));
    });
    if(!map.hasLayer(soLayer))soLayer.addTo(map);
    var ce=document.getElementById('sobjCount');if(ce)ce.textContent=n;
  }
  window.setAllSObjKat=function(v){document.querySelectorAll('.sobjKatC').forEach(function(c){c.checked=v;});aktiveKat=new Set();if(v)katList.forEach(function(k){aktiveKat.add(k);});refreshSObj();};
  window.setAllSObjStadt=function(v){document.querySelectorAll('.sobjStadtC').forEach(function(c){c.checked=v;});aktiveStadt=new Set();if(v)stadtList.forEach(function(k){aktiveStadt.add(k);});refreshSObj();};
  document.addEventListener('change',function(e){
    if(e.target&&e.target.classList.contains('sobjKatC')){if(e.target.checked)aktiveKat.add(e.target.value);else aktiveKat.delete(e.target.value);refreshSObj();}
    if(e.target&&e.target.classList.contains('sobjStadtC')){if(e.target.checked)aktiveStadt.add(e.target.value);else aktiveStadt.delete(e.target.value);refreshSObj();}
  });
  var shS=document.getElementById('shSObj');if(shS)shS.addEventListener('change',refreshSObj);
})();

// ════════════════════════════════════════════════════════════════
// BOMBENFUNDE
// ════════════════════════════════════════════════════════════════
(function(){
  if(!DATA.bombenfunde||!DATA.bombenfunde.length)return;
  var bombLayer=L.layerGroup(), evakLayer=L.layerGroup();
  var BO=DATA.bombenfunde;
  var aktiveKom=new Set();
  var komSet={}; BO.forEach(function(b){komSet[b.ort]=(komSet[b.ort]||0)+1;});
  var komList=Object.keys(komSet).sort();
  komList.forEach(function(k){aktiveKom.add(k);});
  var klEl=document.getElementById('bombKomList');
  if(klEl) komList.forEach(function(k){
    var l=document.createElement('label');l.style.display='block';
    l.innerHTML='<input type="checkbox" class="bombKomC" value="'+k+'" checked> '+k+' <span style="color:#888;font-size:10px;">('+komSet[k]+')</span>';
    klEl.appendChild(l);
  });
  var totalEl=document.getElementById('bombTotal');if(totalEl)totalEl.textContent=BO.length;
  function bombPopup(b){
    return '<div style="font-family:sans-serif;font-size:12px;min-width:220px;">'
      +'<div style="background:#c05621;color:#fff;padding:6px 10px;margin:-1px -1px 6px -1px;border-radius:3px 3px 0 0;font-weight:700;">Bombenfund</div>'
      +'<table style="border-collapse:collapse;width:100%;font-size:11.5px;">'
      +'<tr><td style="color:#666;padding:2px 6px 2px 0">Ort</td><td>'+b.ort+(b.st&&b.st!==b.ort?' · '+b.st:'')+'</td></tr>'
      +(b.ad?'<tr><td style="color:#666;padding:2px 6px 2px 0">Adresse</td><td>'+b.ad+'</td></tr>':'')
      +'<tr><td style="color:#666;padding:2px 6px 2px 0">Einsatz-Nr.</td><td>'+b.nr+'</td></tr>'
      +'</table></div>';
  }
  function refreshBomb(){
    bombLayer.clearLayers();
    if(!document.getElementById('shBomb')||!document.getElementById('shBomb').checked)return;
    var n=0;
    BO.forEach(function(b){
      if(!aktiveKom.has(b.ort))return; n++;
      bombLayer.addLayer(L.marker([b.lat,b.lon],{icon:L.divIcon({className:'',
        html:'<div style="width:14px;height:14px;background:#c05621;border:2px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(192,86,33,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:700;">B</div>',
        iconSize:[14,14],iconAnchor:[7,7]}),zIndexOffset:600}).bindPopup(bombPopup(b),{maxWidth:280}));
    });
    if(!map.hasLayer(bombLayer))bombLayer.addTo(map);
    var ce=document.getElementById('bombCount');if(ce)ce.textContent=n;
  }
  window.setAllBombKom=function(v){document.querySelectorAll('.bombKomC').forEach(function(c){c.checked=v;});aktiveKom=new Set();if(v)komList.forEach(function(k){aktiveKom.add(k);});refreshBomb();};
  document.addEventListener('change',function(e){
    if(e.target&&e.target.classList.contains('bombKomC')){if(e.target.checked)aktiveKom.add(e.target.value);else aktiveKom.delete(e.target.value);refreshBomb();}
  });
  var shB=document.getElementById('shBomb');if(shB)shB.addEventListener('change',refreshBomb);
  // Evakuierungsplanung
  var evakPt=null, evakMarker=null, evakCircle=null;
  window.bombEvakStart=function(){
    document.getElementById('bombEvakRadius').style.display='block';
    document.getElementById('bombEvakResult').innerHTML='<span style="color:#c05621;font-style:italic;">Klicke auf die Karte, um den Evakuierungspunkt zu setzen.</span>';
    window._bombEvakMode=true;
    map.getContainer().style.cursor='crosshair';
  };
  map.on('click',function(e){
    if(!window._bombEvakMode)return;
    evakPt=e.latlng;
    if(evakMarker)map.removeLayer(evakMarker);
    evakMarker=L.marker(evakPt,{icon:L.divIcon({className:'',
      html:'<div style="width:16px;height:16px;background:#c05621;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(192,86,33,0.8);"></div>',
      iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);
    document.getElementById('bombEvakResult').innerHTML='<span style="color:#276749;">Punkt gesetzt. Radius eingeben und „Berechnen" klicken.</span>';
    window._bombEvakMode=false;
    map.getContainer().style.cursor='';
  });
  window.bombEvakCalc=function(){
    if(!evakPt){document.getElementById('bombEvakResult').innerHTML='<span style="color:#c0392b;">Bitte erst einen Punkt setzen.</span>';return;}
    var radius=parseInt(document.getElementById('bombRadiusInput').value)||500;
    evakLayer.clearLayers();
    if(evakCircle)map.removeLayer(evakCircle);
    evakCircle=L.circle(evakPt,{radius:radius,color:'#c05621',weight:2,fillColor:'#c05621',fillOpacity:0.12,dashArray:'6,4'}).addTo(map);
    map.fitBounds(evakCircle.getBounds(),{padding:[40,40]});
    document.getElementById('bombEvakResult').innerHTML='<span style="color:#2b6cb0;">Berechne...</span>';
    // Einwohner zählen (aus Zensus-Daten)
    var ew=0;
    if(DATA.bevoelkerung&&DATA.bevoelkerung.cells){
      var R=6371000,dLat=radius/R*180/Math.PI,dLon=radius/(R*Math.cos(evakPt.lat*Math.PI/180))*180/Math.PI;
      DATA.bevoelkerung.cells.forEach(function(c){
        var la=c[0],lo=c[1];
        if(Math.abs(la-evakPt.lat)>dLat||Math.abs(lo-evakPt.lng)>dLon)return;
        var dx=(lo-evakPt.lng)*Math.cos(evakPt.lat*Math.PI/180)*111320;
        var dy=(la-evakPt.lat)*111320;
        if(dx*dx+dy*dy<=radius*radius) ew+=c[2];
      });
    }
    // Eigene eingebettete Sonderobjekte im Radius
    var soImRadius=[];
    function distCheck(lat,lon){var dx=(lon-evakPt.lng)*Math.cos(evakPt.lat*Math.PI/180)*111320;var dy=(lat-evakPt.lat)*111320;return dx*dx+dy*dy<=radius*radius;}
    if(DATA.sonderobjekte) DATA.sonderobjekte.forEach(function(s){if(distCheck(s.lat,s.lon)) soImRadius.push({kat:s.kat,name:s.name});});
    if(DATA.stations) DATA.stations.forEach(function(s){if(distCheck(s.lat,s.lon)) soImRadius.push({kat:'Feuerwache',name:s.name});});
    if(DATA.rett_wachen) DATA.rett_wachen.forEach(function(w){if(distCheck(w.lat,w.lon)) soImRadius.push({kat:'Rettungswache',name:w.kurz||w.name||'RW'});});
    if(DATA.hiorg) DATA.hiorg.forEach(function(h){if(distCheck(h.lat,h.lon)) soImRadius.push({kat:'HiOrg ('+h.org+')',name:h.org+' '+h.ort});});
    // Overpass API: Schulen, KiTas, Krankenhäuser, Einkaufszentren, Behörden, Sehenswürdigkeiten
    var ovpQuery = '[out:json][timeout:10];('
      +'node["amenity"~"school|kindergarten|hospital|clinic|nursing_home|pharmacy|social_facility|community_centre|place_of_worship|theatre|cinema"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +'node["shop"~"supermarket|mall|department_store"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +'node["office"~"government"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +'node["tourism"~"attraction|museum|hotel"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +'node["leisure"~"sports_centre|stadium|swimming_pool"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +'way["amenity"~"school|kindergarten|hospital|clinic|nursing_home|social_facility"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +'way["shop"~"supermarket|mall|department_store"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +'way["leisure"~"sports_centre|stadium|swimming_pool"](around:'+radius+','+evakPt.lat+','+evakPt.lng+');'
      +');out center tags;';
    var KAT_MAP={'school':'Schule','kindergarten':'KiTa','hospital':'Krankenhaus','clinic':'Klinik',
      'nursing_home':'Pflegeheim','pharmacy':'Apotheke','social_facility':'Sozialeinrichtung',
      'community_centre':'Gemeindezentrum','place_of_worship':'Kirche/Moschee','theatre':'Theater',
      'cinema':'Kino','supermarket':'Supermarkt','mall':'Einkaufszentrum','department_store':'Kaufhaus',
      'government':'Behörde','attraction':'Sehenswürdigkeit','museum':'Museum','hotel':'Hotel',
      'sports_centre':'Sportzentrum','stadium':'Stadion','swimming_pool':'Schwimmbad'};
    fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(ovpQuery)})
    .then(function(r){return r.json();}).then(function(data){
      var osmObj=[];
      var seen=new Set();
      (data.elements||[]).forEach(function(e){
        var name=e.tags&&e.tags.name?e.tags.name:'';
        if(!name||seen.has(name))return; seen.add(name);
        var typ=e.tags.amenity||e.tags.shop||e.tags.office||e.tags.tourism||e.tags.leisure||'';
        osmObj.push({kat:KAT_MAP[typ]||typ,name:name});
      });
      showEvakResult(ew, soImRadius, osmObj, radius);
    }).catch(function(){
      showEvakResult(ew, soImRadius, [], radius);
    });
  };
  function showEvakResult(ew, soImRadius, osmObj, radius){
    var allObj = soImRadius.concat(osmObj);
    // Deduplizieren nach Name
    var seen=new Set(),unique=[];
    allObj.forEach(function(o){var k=o.name.toLowerCase();if(!seen.has(k)){seen.add(k);unique.push(o);}});
    unique.sort(function(a,b){return a.kat.localeCompare(b.kat)||a.name.localeCompare(b.name);});
    var html='<div style="padding:8px;background:#fff5f0;border:1px solid #f0c989;border-radius:3px;">'
      +'<div style="font-weight:700;color:#c05621;margin-bottom:6px;">Evakuierungsanalyse ('+radius+' m)</div>'
      +'<div style="font-size:12px;margin-bottom:4px;"><b>Einwohner (ca.):</b> '+ew.toLocaleString('de-DE')+'</div>'
      +'<div style="font-size:12px;margin-bottom:4px;"><b>Objekte im Radius:</b> '+unique.length+(osmObj.length?' <span style="color:#888;font-size:10px;">(inkl. '+osmObj.length+' aus OpenStreetMap)</span>':'')+'</div>';
    if(unique.length){
      html+='<div style="max-height:200px;overflow-y:auto;font-size:11px;margin-top:4px;">';
      unique.forEach(function(s){html+='<div style="padding:2px 0;border-bottom:1px solid #eee;">'+s.kat+': <b>'+s.name+'</b></div>';});
      html+='</div>';
    }
    html+='</div>';
    document.getElementById('bombEvakResult').innerHTML=html;
  }
  window.bombEvakClear=function(){
    if(evakMarker){map.removeLayer(evakMarker);evakMarker=null;}
    if(evakCircle){map.removeLayer(evakCircle);evakCircle=null;}
    evakLayer.clearLayers();evakPt=null;
    window._bombEvakMode=false;
    map.getContainer().style.cursor='';
    document.getElementById('bombEvakRadius').style.display='none';
    document.getElementById('bombEvakResult').innerHTML='';
  };
})();

// ════════════════════════════════════════════════════════════════
// WALD- & VEGETATIONSBRAND (DWD WMS + NRW Klimaanpassung)
// ════════════════════════════════════════════════════════════════
(function(){
  // DWD Geoportal WMS für WBI/GLFI
  var wbiLayer=null, glfiLayer=null, waldNRWLayer=null;
  var DWD_WMS='https://maps.dwd.de/geoserver/dwd/wms';
  var NRW_WALD_WMS='https://www.wms.nrw.de/umwelt/klimaanpassung';
  function getWBOpacity(){ return parseInt(document.getElementById('wbOpacity').value)/100; }
  window.toggleWBI = function(on){
    if(on){
      if(!wbiLayer) wbiLayer=L.tileLayer.wms(DWD_WMS,{layers:'dwd:Waldbrandgefahrenindex',format:'image/png',transparent:true,version:'1.3.0',opacity:getWBOpacity(),attribution:'WBI: © DWD'});
      wbiLayer.addTo(map);
    }else if(wbiLayer&&map.hasLayer(wbiLayer)) map.removeLayer(wbiLayer);
  };
  window.toggleGLFI = function(on){
    if(on){
      if(!glfiLayer) glfiLayer=L.tileLayer.wms(DWD_WMS,{layers:'dwd:Graslandfeuerindex',format:'image/png',transparent:true,version:'1.3.0',opacity:getWBOpacity(),attribution:'GLFI: © DWD'});
      glfiLayer.addTo(map);
    }else if(glfiLayer&&map.hasLayer(glfiLayer)) map.removeLayer(glfiLayer);
  };
  window.toggleWaldNRW = function(on){
    if(on){
      if(!waldNRWLayer) waldNRWLayer=L.tileLayer.wms(NRW_WALD_WMS,{layers:'Waldbrandgefahr',format:'image/png',transparent:true,version:'1.3.0',opacity:getWBOpacity(),attribution:'Waldbrandgefahr: © LANUV NRW'});
      waldNRWLayer.addTo(map);
    }else if(waldNRWLayer&&map.hasLayer(waldNRWLayer)) map.removeLayer(waldNRWLayer);
  }
  var cbWBI=document.getElementById('shWBI'), cbGLFI=document.getElementById('shGLFI'), cbWNRW=document.getElementById('shWaldNRW');
  if(cbWBI) cbWBI.addEventListener('change',function(){toggleWBI(this.checked);});
  if(cbGLFI) cbGLFI.addEventListener('change',function(){toggleGLFI(this.checked);});
  if(cbWNRW) cbWNRW.addEventListener('change',function(){toggleWaldNRW(this.checked);});
  var sl=document.getElementById('wbOpacity');
  if(sl) sl.addEventListener('input',function(){
    var v=parseInt(sl.value);
    document.getElementById('wbOpacityLabel').textContent=v+'%';
    [wbiLayer,glfiLayer,waldNRWLayer].forEach(function(l){if(l)l.setOpacity(v/100);});
  });
})();

// ════════════════════════════════════════════════════════════════
// BRANDSCHUTZ LIVE-ISOCHRONEN (ORS API) + Mode-Switcher
// ════════════════════════════════════════════════════════════════
(function(){
  var brandLiveLayer = L.layerGroup();
  var ISO_COLORS_B = {2:'#67000d',4:'#a50f15',6:'#cb181d',8:'#ef3b2c',10:'#fb6a4a',12:'#fc9272',14:'#fcbba1',16:'#fee0d2'};
  var DEFAULT_ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImM0ZTI5OTMzYWI3ODRjMzZiMDVhM2VlMzg2YjhiMzViIiwiaCI6Im11cm11cjY0In0=';
  function getOrsKey(){ return localStorage.getItem('ors_api_key') || DEFAULT_ORS_KEY; }
  window.brandIsoMode = function(mode){
    var offP=document.getElementById('brandIsoOfflinePanel'),livP=document.getElementById('brandIsoLivePanel');
    var offB=document.getElementById('brandIsoOffline'),livB=document.getElementById('brandIsoLive');
    if(mode==='live'){offP.style.display='none';livP.style.display='block';offB.style.background='#f0f0f0';offB.style.color='#666';livB.style.background='#c8102e';livB.style.color='#fff';}
    else{offP.style.display='block';livP.style.display='none';offB.style.background='#c8102e';offB.style.color='#fff';livB.style.background='#f0f0f0';livB.style.color='#666';}
  };
  var tEl=document.getElementById('brandLiveTboxes');
  if(tEl)[2,4,6,8,10,12,14,16].forEach(function(m){var l=document.createElement('label');l.style.cssText='display:inline-flex;align-items:center;gap:2px;font-size:11.5px;';l.innerHTML='<input type="checkbox" class="brandLiveTC" value="'+m+'">'+m;tEl.appendChild(l);});
  var wEl=document.getElementById('brandLiveWachenList');
  if(wEl&&DATA.stations) DATA.stations.slice().sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(s){var idx=DATA.stations.indexOf(s);var l=document.createElement('label');l.style.display='block';l.innerHTML='<input type="checkbox" class="brandLiveWC" value="'+idx+'"> '+s.name;wEl.appendChild(l);});
  var sEl=document.getElementById('brandLiveSearch');
  if(sEl)sEl.addEventListener('input',function(){var q=sEl.value.toLowerCase();document.querySelectorAll('#brandLiveWachenList label').forEach(function(l){l.style.display=l.textContent.toLowerCase().includes(q)?'block':'none';});});
  window.brandLiveSelectAll=function(v){document.querySelectorAll('.brandLiveWC').forEach(function(c){c.checked=v;});};
  function countEWB(feat){if(!DATA.bevoelkerung||!DATA.bevoelkerung.cells)return 0;var ew=0;try{var poly=turf.feature(feat.geometry||feat);DATA.bevoelkerung.cells.forEach(function(c){if(turf.booleanPointInPolygon(turf.point([c[1],c[0]]),poly))ew+=c[2];});}catch(e){}return ew;}
  window.brandLiveCalc=function(){
    var key=getOrsKey();if(!key){document.getElementById('brandLiveStatus').innerHTML='<span style="color:#c0392b;">Kein ORS API-Key.</span>';return;}
    var profile=document.getElementById('brandLiveProf').value;
    var times=[];document.querySelectorAll('.brandLiveTC:checked').forEach(function(c){times.push(parseInt(c.value));});
    if(!times.length){document.getElementById('brandLiveStatus').innerHTML='<span style="color:#c0392b;">Zeitstufe wählen.</span>';return;}
    times.sort(function(a,b){return a-b;});
    var wachen=[];document.querySelectorAll('.brandLiveWC:checked').forEach(function(c){wachen.push(parseInt(c.value));});
    if(!wachen.length){document.getElementById('brandLiveStatus').innerHTML='<span style="color:#c0392b;">Wache wählen.</span>';return;}
    brandLiveLayer.clearLayers();if(!map.hasLayer(brandLiveLayer))brandLiveLayer.addTo(map);
    var total=wachen.length,done=0,errors=0,ewResults=[];
    document.getElementById('brandLiveStatus').innerHTML='<span style="color:#2b6cb0;">Berechne '+total+' Isochronen...</span>';
    var rangeSeconds=times.map(function(t){return t*60;});
    function doNext(idx){
      if(idx>=wachen.length){
        document.getElementById('brandLiveStatus').innerHTML='<span style="color:#276749;font-weight:600;">'+done+'/'+total+' berechnet'+(errors?' ('+errors+' Fehler)':'')+'</span>';
        var ewEl=document.getElementById('brandLiveEinwohner');
        if(ewEl&&ewResults.length){var h='<div style="margin-top:6px;padding:6px 8px;background:#fff5f0;border:1px solid #fca;border-radius:3px;font-size:11px;"><div style="font-weight:600;margin-bottom:3px;">Einwohner:</div>';
        ewResults.forEach(function(r){h+='<div>'+r.n+': '+r.t.map(function(t){return '<b>'+t.m+'min</b> '+t.e.toLocaleString('de-DE');}).join(' · ')+'</div>';});
        h+='</div>';ewEl.innerHTML=h;}
        return;
      }
      var s=DATA.stations[wachen[idx]];
      fetch('https://api.openrouteservice.org/v2/isochrones/'+profile,{method:'POST',headers:{'Authorization':key,'Content-Type':'application/json'},body:JSON.stringify({locations:[[s.lon,s.lat]],range:rangeSeconds,range_type:'time'})})
      .then(function(r){return r.json();}).then(function(data){
        if(data.features){var wE={n:s.name,t:[]};data.features.slice().reverse().forEach(function(f){var min=Math.round(f.properties.value/60);var col={2:'#67000d',4:'#a50f15',6:'#cb181d',8:'#ef3b2c',10:'#fb6a4a',12:'#fc9272',14:'#fcbba1',16:'#fee0d2'}[min]||'#ccc';
        var ew=countEWB(f);wE.t.push({m:min,e:ew});
        brandLiveLayer.addLayer(L.geoJSON(f,{style:{fillColor:col,fillOpacity:0.35,color:col,weight:1,opacity:0.6}}).bindPopup('<b>'+s.name+'</b><br>'+min+' Min<br>Einwohner: <b>'+ew.toLocaleString('de-DE')+'</b>'));});
        ewResults.push(wE);done++;}else errors++;
      }).catch(function(){errors++;}).finally(function(){document.getElementById('brandLiveStatus').innerHTML='<span style="color:#2b6cb0;">'+(done+errors)+'/'+total+'...</span>';setTimeout(function(){doNext(idx+1);},500);});
    }
    doNext(0);
  };
  window.brandLiveClear=function(){brandLiveLayer.clearLayers();document.getElementById('brandLiveStatus').innerHTML='';var e=document.getElementById('brandLiveEinwohner');if(e)e.innerHTML='';};
  window.brandLiveSetOpacity=function(v){document.getElementById('brandLiveOpacityLabel').textContent=v+'%';brandLiveLayer.eachLayer(function(l){if(l.setStyle)l.setStyle({fillOpacity:parseInt(v)/100});});};
})();

// ════════════════════════════════════════════════════════════════
// RETTUNGSDIENST LIVE-ISOCHRONEN (ORS API)
// ════════════════════════════════════════════════════════════════
(function(){
  if(!DATA.rett_wachen||!DATA.rett_wachen.length) return;
  var rettIsoLayer = L.layerGroup();
  var ISO_COLORS = {2:'#08519c',4:'#3182bd',6:'#6baed6',8:'#9ecae1',10:'#c6dbef',12:'#deebf7',14:'#f7fbff',16:'#fff5eb'};
  var DEFAULT_ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImM0ZTI5OTMzYWI3ODRjMzZiMDVhM2VlMzg2YjhiMzViIiwiaCI6Im11cm11cjY0In0=';
  function getOrsKey(){ return localStorage.getItem('ors_api_key') || DEFAULT_ORS_KEY; }
  window.rettIsoMode = function(mode){
    var livP=document.getElementById('rettIsoLivePanel'),offP=document.getElementById('rettIsoOfflinePanel');
    var livB=document.getElementById('rettIsoLive'),offB=document.getElementById('rettIsoOffline');
    if(mode==='live'){livP.style.display='block';offP.style.display='none';livB.style.background='#2b6cb0';livB.style.color='#fff';offB.style.background='#f0f0f0';offB.style.color='#666';}
    else{livP.style.display='none';offP.style.display='block';livB.style.background='#f0f0f0';livB.style.color='#666';offB.style.background='#2b6cb0';offB.style.color='#fff';}
  };
  var tEl = document.getElementById('rettIsoTboxes');
  if(tEl) [2,4,6,8,10,12,14,16].forEach(function(m){var l=document.createElement('label');l.style.cssText='display:inline-flex;align-items:center;gap:2px;font-size:11.5px;';l.innerHTML='<input type="checkbox" class="rettIsoTC" value="'+m+'">'+m;tEl.appendChild(l);});
  var wEl = document.getElementById('rettIsoWachenList');
  if(wEl) DATA.rett_wachen.slice().map(function(w,i){return {w:w,i:i};}).filter(function(e){return !e.w.geplant;}).sort(function(a,b){return (a.w.kurz||a.w.name||'').localeCompare(b.w.kurz||b.w.name||'');}).forEach(function(entry){var w=entry.w;var l=document.createElement('label');l.style.display='block';l.innerHTML='<input type="checkbox" class="rettIsoWC" value="'+entry.i+'"> '+(w.kurz||w.name||'RW');wEl.appendChild(l);});
  var searchEl=document.getElementById('rettIsoSearch'),clearEl=document.getElementById('rettIsoSearchClear');
  if(searchEl) searchEl.addEventListener('input',function(){var q=searchEl.value.toLowerCase();document.querySelectorAll('#rettIsoWachenList label').forEach(function(l){l.style.display=l.textContent.toLowerCase().includes(q)?'block':'none';});if(clearEl)clearEl.style.display=searchEl.value?'block':'none';});
  function countEW(feat){if(!DATA.bevoelkerung||!DATA.bevoelkerung.cells)return 0;var ew=0;try{var poly=turf.feature(feat.geometry||feat);DATA.bevoelkerung.cells.forEach(function(c){if(turf.booleanPointInPolygon(turf.point([c[1],c[0]]),poly))ew+=c[2];});}catch(e){}return ew;}
  window.rettIsoSelectAll=function(v){document.querySelectorAll('.rettIsoWC').forEach(function(c){c.checked=v;});};
  window.rettIsoCalc=function(){
    var key=getOrsKey();if(!key){document.getElementById('rettIsoStatus').innerHTML='<span style="color:#c0392b;">Kein ORS API-Key.</span>';return;}
    var profile=document.getElementById('rettProf').value;
    var times=[];document.querySelectorAll('.rettIsoTC:checked').forEach(function(c){times.push(parseInt(c.value));});
    if(!times.length){document.getElementById('rettIsoStatus').innerHTML='<span style="color:#c0392b;">Zeitstufe wählen.</span>';return;}
    times.sort(function(a,b){return a-b;});
    var wachen=[];document.querySelectorAll('.rettIsoWC:checked').forEach(function(c){wachen.push(parseInt(c.value));});
    if(!wachen.length){document.getElementById('rettIsoStatus').innerHTML='<span style="color:#c0392b;">Wache wählen.</span>';return;}
    rettIsoLayer.clearLayers();if(!map.hasLayer(rettIsoLayer))rettIsoLayer.addTo(map);
    var total=wachen.length,done=0,errors=0,ewResults=[],allFeatures=[];
    document.getElementById('rettIsoStatus').innerHTML='<span style="color:#2b6cb0;">Berechne '+total+' Isochronen...</span>';
    var rangeSeconds=times.map(function(t){return t*60;});
    function doNext(idx){
      if(idx>=wachen.length){
        document.getElementById('rettIsoStatus').innerHTML='<span style="color:#276749;font-weight:600;">'+done+'/'+total+' berechnet'+(errors?' ('+errors+' Fehler)':'')+'</span>';
        // Auto-Cache für Offline-Modus
        if(allFeatures.length){try{localStorage.setItem('rett_iso_offline',JSON.stringify({type:'FeatureCollection',features:allFeatures}));}catch(e){}}
        var ewEl=document.getElementById('rettIsoEinwohner');
        if(ewEl&&ewResults.length){var h='<div style="margin-top:6px;padding:6px 8px;background:#f0f7ff;border:1px solid #90cdf4;border-radius:3px;font-size:11px;"><div style="font-weight:600;margin-bottom:3px;">Einwohner:</div>';
        ewResults.forEach(function(r){h+='<div>'+r.n+': '+r.t.map(function(t){return '<b>'+t.m+'min</b> '+t.e.toLocaleString('de-DE');}).join(' · ')+'</div>';});
        h+='</div>';ewEl.innerHTML=h;}
        return;
      }
      var w=DATA.rett_wachen[wachen[idx]];
      fetch('https://api.openrouteservice.org/v2/isochrones/'+profile,{method:'POST',headers:{'Authorization':key,'Content-Type':'application/json'},body:JSON.stringify({locations:[[w.lon,w.lat]],range:rangeSeconds,range_type:'time'})})
      .then(function(r){return r.json();}).then(function(data){
        if(data.features){var wE={n:w.kurz||w.name,t:[]};
        data.features.slice().reverse().forEach(function(f){var min=Math.round(f.properties.value/60);var col=ISO_COLORS[min]||'#ccc';var ew=countEW(f);wE.t.push({m:min,e:ew});
        f.properties.wache=w.kurz||w.name;f.properties.wacheIdx=DATA.rett_wachen.indexOf(w);allFeatures.push(f);
        rettIsoLayer.addLayer(L.geoJSON(f,{style:{fillColor:col,fillOpacity:0.35,color:col,weight:1,opacity:0.6}}).bindPopup('<b>'+(w.kurz||w.name)+'</b><br>'+min+' Min<br>Einwohner: <b>'+ew.toLocaleString('de-DE')+'</b>'));});
        ewResults.push(wE);done++;}else errors++;
      }).catch(function(){errors++;}).finally(function(){document.getElementById('rettIsoStatus').innerHTML='<span style="color:#2b6cb0;">'+(done+errors)+'/'+total+'...</span>';setTimeout(function(){doNext(idx+1);},500);});
    }
    doNext(0);
  };
  window.rettIsoClear=function(){rettIsoLayer.clearLayers();document.getElementById('rettIsoStatus').innerHTML='';var e=document.getElementById('rettIsoEinwohner');if(e)e.innerHTML='';};
  window.rettIsoSetOpacity=function(v){document.getElementById('rettIsoOpacityLabel').textContent=v+'%';rettIsoLayer.eachLayer(function(l){if(l.setStyle)l.setStyle({fillOpacity:parseInt(v)/100});});};
})();

// ════════════════════════════════════════════════════════════════
// ANALYSE RETTUNGSWACHEN (wie AAO, Profile: Lieferwagen + PKW)
// ════════════════════════════════════════════════════════════════
(function(){
  if(!DATA.rett_wachen) return;
  var DEFAULT_ORS_KEY='eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImM0ZTI5OTMzYWI3ODRjMzZiMDVhM2VlMzg2YjhiMzViIiwiaCI6Im11cm11cjY0In0=';
  function getKey(){return localStorage.getItem('ors_api_key')||DEFAULT_ORS_KEY;}
  var rettAaoProfile='driving-hgv'; // Lieferwagen
  var rettAaoLayer=L.layerGroup();
  var rettAaoMarker=null;
  window.rettAaoMode=function(mode,lbl){
    document.getElementById('rettAao-inp-adr').style.display=mode==='adresse'?'block':'none';
    document.getElementById('rettAao-inp-ort').style.display=mode==='ortskern'?'block':'none';
    document.querySelectorAll('#sec-rett-aao .aao-mode-opt').forEach(function(el){el.classList.remove('active');});
    if(lbl)lbl.classList.add('active');
  };
  window.rettAaoSetProfile=function(p){
    rettAaoProfile=p==='pkw'?'driving-car':'driving-hgv';
    document.getElementById('rettAao-btn-lw').classList.toggle('active',p==='lw');
    document.getElementById('rettAao-btn-pkw').classList.toggle('active',p==='pkw');
  };
  window.rettAaoReset=function(){
    rettAaoLayer.clearLayers();
    if(rettAaoMarker){map.removeLayer(rettAaoMarker);rettAaoMarker=null;}
    document.getElementById('rettAaoStatus').innerHTML='';
    document.getElementById('rettAaoResults').innerHTML='';
  };
  window.rettAaoBerechnen=async function(){
    var key=getKey();if(!key){document.getElementById('rettAaoStatus').innerHTML='<span style="color:#c0392b;">Kein ORS API-Key.</span>';return;}
    var statusEl=document.getElementById('rettAaoStatus');
    var resultsEl=document.getElementById('rettAaoResults');
    rettAaoLayer.clearLayers();if(rettAaoMarker){map.removeLayer(rettAaoMarker);rettAaoMarker=null;}
    // Ziel-Koordinaten ermitteln
    var mode=document.querySelector('input[name="rettAaoMode"]:checked').value;
    var lat,lon;
    if(mode==='adresse'){
      var adr=document.getElementById('rettAaoAdrInput').value.trim();
      if(!adr){statusEl.innerHTML='<span style="color:#c0392b;">Adresse eingeben.</span>';return;}
      statusEl.innerHTML='<span style="color:#2b6cb0;">Geocodiere Adresse...</span>';
      try{
        var r=await fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(adr+', Rhein-Erft-Kreis')+'&limit=1');
        var d=await r.json();
        if(!d.length){statusEl.innerHTML='<span style="color:#c0392b;">Adresse nicht gefunden.</span>';return;}
        lat=parseFloat(d[0].lat);lon=parseFloat(d[0].lon);
      }catch(e){statusEl.innerHTML='<span style="color:#c0392b;">Geocodierung fehlgeschlagen.</span>';return;}
    } else {
      var ort=document.getElementById('rettAaoOrtSelect').value;
      if(!ort){statusEl.innerHTML='<span style="color:#c0392b;">Stadt wählen.</span>';return;}
      statusEl.innerHTML='<span style="color:#2b6cb0;">Geocodiere Ortskern...</span>';
      try{
        var r=await fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(ort+', Rhein-Erft-Kreis')+'&limit=1');
        var d=await r.json();
        if(!d.length){statusEl.innerHTML='<span style="color:#c0392b;">Ort nicht gefunden.</span>';return;}
        lat=parseFloat(d[0].lat);lon=parseFloat(d[0].lon);
      }catch(e){statusEl.innerHTML='<span style="color:#c0392b;">Geocodierung fehlgeschlagen.</span>';return;}
    }
    rettAaoMarker=L.marker([lat,lon],{zIndexOffset:1000}).addTo(map).bindPopup('<b>Einsatzort</b>').openPopup();
    // Aktive Rettungswachen
    var aktive=DATA.rett_wachen.filter(function(w){return !w.geplant;});
    var count=parseInt(document.getElementById('rettAaoCount').value)||10;
    statusEl.innerHTML='<span style="color:#2b6cb0;">Berechne Routen zu '+aktive.length+' Rettungswachen...</span>';
    // ORS Matrix API für alle aktiven Wachen
    var sources=[[lon,lat]];
    var destinations=aktive.map(function(w){return [w.lon,w.lat];});
    try{
      var r=await fetch('https://api.openrouteservice.org/v2/matrix/'+rettAaoProfile,{
        method:'POST',headers:{'Authorization':key,'Content-Type':'application/json'},
        body:JSON.stringify({locations:sources.concat(destinations),sources:[0],destinations:aktive.map(function(_,i){return i+1;})})
      });
      var data=await r.json();
      if(!data.durations||!data.durations[0]){statusEl.innerHTML='<span style="color:#c0392b;">ORS Routing fehlgeschlagen.</span>';return;}
      var durations=data.durations[0];
      var distances=data.distances?data.distances[0]:null;
      // Sortieren nach Fahrzeit
      var ranked=aktive.map(function(w,i){return {w:w,dur:durations[i],dist:distances?distances[i]:null,idx:i};})
        .filter(function(r){return r.dur!==null&&r.dur<99999;})
        .sort(function(a,b){return a.dur-b.dur;});
      var top=ranked.slice(0,count);
      // Ergebnis-HTML
      var html='<div style="margin-top:6px;">';
      html+='<div style="font-weight:600;font-size:12px;margin-bottom:4px;">Nächste Rettungswachen:</div>';
      var colors=['#08519c','#2171b5','#4292c6','#6baed6','#9ecae1','#c6dbef','#deebf7','#f7fbff','#f0f0f0','#ddd'];
      top.forEach(function(r,i){
        var min=Math.floor(r.dur/60);var sec=Math.round(r.dur%60);
        var km=r.dist?Math.round(r.dist/100)/10:null;
        var col=colors[Math.min(i,colors.length-1)];
        html+='<div style="padding:5px 7px;margin-bottom:2px;background:'+col+'22;border-left:3px solid '+col+';border-radius:2px;font-size:11.5px;cursor:pointer;" onclick="rettAaoShowRoute('+r.idx+')">'
          +'<b>'+(i+1)+'. '+(r.w.kurz||r.w.name)+'</b>'
          +' — <b>'+min+':'+('0'+sec).slice(-2)+' Min</b>'
          +(km?' ('+km+' km)':'')
          +'</div>';
      });
      html+='</div>';
      resultsEl.innerHTML=html;
      statusEl.innerHTML='<span style="color:#276749;font-weight:600;">'+top.length+' Wachen gefunden</span>';
      map.setView([lat,lon],13);
      // Routen-Linien für Top-Wachen
      if(!map.hasLayer(rettAaoLayer))rettAaoLayer.addTo(map);
      top.forEach(function(r,i){
        var col=colors[Math.min(i,colors.length-1)];
        L.polyline([[lat,lon],[r.w.lat,r.w.lon]],{color:col,weight:2.5,opacity:0.7,dashArray:'5,5'}).addTo(rettAaoLayer);
      });
    }catch(e){statusEl.innerHTML='<span style="color:#c0392b;">Fehler: '+e.message+'</span>';}
  };
})();

// ════════════════════════════════════════════════════════════════
// RETTUNGSDIENST OFFLINE-ISOCHRONEN (Cache/localStorage)
// ════════════════════════════════════════════════════════════════
(function(){
  var rettOffLayer = L.layerGroup(), rettGapLayer = L.layerGroup();
  var ISO_COLORS = {2:'#08519c',4:'#3182bd',6:'#6baed6',8:'#9ecae1',10:'#c6dbef',12:'#deebf7',14:'#f7fbff',16:'#fff5eb'};
  var tEl = document.getElementById('rettOffTboxes');
  if(tEl) [2,4,6,8,10,12,14,16].forEach(function(m){var l=document.createElement('label');l.style.cssText='display:inline-flex;align-items:center;gap:2px;font-size:11.5px;';l.innerHTML='<input type="checkbox" class="rettOffTC" value="'+m+'">'+m;tEl.appendChild(l);});

  function getCachedIso(){
    try{var s=localStorage.getItem('rett_iso_offline');if(s)return JSON.parse(s);}catch(e){}
    return DATA.rett_isochrones||null;
  }

  window.rettOffCalc=function(){
    var cached = getCachedIso();
    if(!cached||!cached.features||!cached.features.length){
      document.getElementById('rettOffStatus').innerHTML='<span style="color:#c05621;">Keine gecachten Isochronen. Bitte einmal im Live-Modus für alle Wachen berechnen — die Daten werden automatisch gecacht.</span>';
      return;
    }
    var times=new Set();document.querySelectorAll('.rettOffTC:checked').forEach(function(c){times.add(parseInt(c.value)*60);});
    if(!times.size){document.getElementById('rettOffStatus').innerHTML='<span style="color:#c0392b;">Zeitstufe wählen.</span>';return;}
    rettOffLayer.clearLayers(); rettGapLayer.clearLayers();
    if(!map.hasLayer(rettOffLayer))rettOffLayer.addTo(map);
    var op=parseInt(document.getElementById('rettOffOp').value)/100;
    var n=0;
    cached.features.forEach(function(f){
      if(!times.has(f.properties.value))return;
      var min=Math.round(f.properties.value/60);
      var col=ISO_COLORS[min]||'#ccc';
      rettOffLayer.addLayer(L.geoJSON(f,{style:{fillColor:col,fillOpacity:op,color:col,weight:1,opacity:0.6}}).bindPopup('<b>'+(f.properties.wache||'RW')+'</b><br>'+min+' Min'));
      n++;
    });
    document.getElementById('rettOffStatus').innerHTML='<span style="color:#276749;font-weight:600;">'+n+' Isochronen angezeigt</span>';
    // Nicht abgedeckte Bereiche
    if(document.getElementById('rettOffShowGap')&&document.getElementById('rettOffShowGap').checked){
      showRettGap(cached, times, op);
    }
  };
  function showRettGap(cached, times, op){
    if(!DATA.kommunen||!DATA.kommunen.features) return;
    try{
      var maxT=Math.max.apply(null,Array.from(times));
      var isoFeats=cached.features.filter(function(f){return f.properties.value===maxT;});
      if(!isoFeats.length)return;
      var merged=isoFeats[0];
      for(var i=1;i<isoFeats.length;i++){try{merged=turf.union(turf.feature(merged.geometry||merged),turf.feature(isoFeats[i].geometry||isoFeats[i]));}catch(e){}}
      var kommunenMerged=DATA.kommunen.features[0];
      for(var i=1;i<DATA.kommunen.features.length;i++){try{kommunenMerged=turf.union(turf.feature(kommunenMerged.geometry),turf.feature(DATA.kommunen.features[i].geometry));}catch(e){}}
      var gap=turf.difference(turf.feature(kommunenMerged.geometry||kommunenMerged),turf.feature(merged.geometry||merged));
      if(gap){
        rettGapLayer.addLayer(L.geoJSON(gap,{style:{fillColor:'#c0392b',fillOpacity:0.25,color:'#c0392b',weight:1.5,dashArray:'4,3'}}));
        if(!map.hasLayer(rettGapLayer))rettGapLayer.addTo(map);
      }
    }catch(e){console.warn('Gap calc error:',e);}
  }
  window.rettOffClear=function(){rettOffLayer.clearLayers();rettGapLayer.clearLayers();document.getElementById('rettOffStatus').innerHTML='';};
  window.rettOffSetOpacity=function(v){document.getElementById('rettOffOpV').textContent=v;var o=parseInt(v)/100;rettOffLayer.eachLayer(function(l){if(l.setStyle)l.setStyle({fillOpacity:o});});};
})();

// ════════════════════════════════════════════════════════════════
// DATENVERWALTUNG: Multi-/Ordner-Upload mit Auto-Zuordnung, Export
// ════════════════════════════════════════════════════════════════
window.datenUploadMulti = function(files){
  if(!files||!files.length) return;
  var statusEl = document.getElementById('uploadMainStatus');
  var results = [];
  var pending = files.length;
  function onDone(name, typ, count){
    results.push('<span style="color:#276749;">'+name+' → '+typ+': <b>'+count+'</b> Datensätze</span>');
    pending--;
    if(pending<=0){
      statusEl.innerHTML = results.join('<br>');
      updateDatenStatus();
    }
  }
  function onErr(name, msg){
    results.push('<span style="color:#c0392b;">'+name+': '+msg+'</span>');
    pending--;
    if(pending<=0){
      statusEl.innerHTML = results.join('<br>');
      updateDatenStatus();
    }
  }
  for(var fi=0;fi<files.length;fi++){
    var file = files[fi];
    if(!file.name.match(/\.(csv|txt)$/i)){pending--;continue;}
    (function(f){
      var fn = f.name.toLowerCase();
      // Auto-Zuordnung per Dateiname
      var typ = 'brand'; // Default
      if(fn.includes('rett')) typ = 'rett';
      else if(fn.includes('hilfsfrist') || fn.includes('_hf')) typ = 'hf';
      datenUploadSingle(typ, f, function(count){onDone(f.name, {brand:'Brandschutz',rett:'Rettungsdienst',hf:'Hilfsfristen'}[typ], count);}, function(msg){onErr(f.name, msg);});
    })(file);
  }
  if(pending<=0) statusEl.innerHTML = '<span style="color:#888;">Keine CSV-Dateien gefunden.</span>';
};

function datenUploadSingle(typ, file, onSuccess, onError){
  var reader = new FileReader();
  reader.onload = function(e){
    var text = e.target.result;
    var sep = text.indexOf('\t') > -1 && text.indexOf(';') === -1 ? '\t' : ';';
    var lines = text.split(/\r?\n/).filter(function(l){return l.trim();});
    if(lines.length < 2){ onError('Datei leer'); return; }
    var headers = lines[0].split(sep).map(function(h){return h.trim().replace(/^\uFEFF/,'');});
    var rows = [];
    for(var i=1;i<lines.length;i++){
      var vals = lines[i].split(sep);
      if(vals.length < 3) continue;
      var obj = {};
      headers.forEach(function(h,j){ obj[h] = (vals[j]||'').trim(); });
      rows.push(obj);
    }
    if(typ === 'brand' || typ === 'rett'){
      var parsed = [];
      rows.forEach(function(r){
        var lat = uplParseCoord(r['Latitude']||r['lat']||r['Lat'], true);
        var lon = uplParseCoord(r['Longitude']||r['lon']||r['Lon'], false);
        if(lat===null||lon===null) return;
        parsed.push({
          lat:lat, lon:lon,
          nr: r['Einsatz-Nr.']||r['nr']||'',
          ort: r['Ort']||r['ort']||'',
          st: r['Stadtteil']||r['st']||'',
          ad: r['Adresse']||r['Straße']||r['ad']||'',
          hn: r['Haus-Nr.']||r['hn']||'',
          sw: r['Stichwort']||r['sw']||'',
          dt: r['Datum']||r['dt']||'',
          yr: parseInt(r['Jahr']||r['yr']||'') || (function(d){var p=(d||'').split(/[.\-\/]/);return p.length>=3?parseInt(p[2])||0:0;})(r['Datum']||r['dt']||''),
          mo: r['Monat']||r['mo']||'',
          ob: r['Objektname']||r['ob']||''
        });
      });
      if(typ==='brand'){
        DATA.incidents = parsed;
        if(typeof window._reloadEinsaetze==='function') window._reloadEinsaetze();
      } else {
        DATA.incidents_rett = parsed;
      }
      onSuccess(parsed.length);
    } else if(typ === 'hf'){
      var parsed = [];
      rows.forEach(function(r){
        var lat = uplParseCoord(r['Latitude']||r['lat']||r['Lat'], true);
        var lon = uplParseCoord(r['Longitude']||r['lon']||r['Lon'], false);
        parsed.push({
          lat:lat, lon:lon,
          nr: r['Einsatz-Nr.']||r['nr']||'',
          kommune: r['Kommune']||r['ort']||'',
          stadtteil: r['Stadtteil']||'',
          strasse: r['Straße']||r['Strasse']||'',
          stichwort: r['Stichwort']||'',
          wache: r['Standortwache']||'',
          hf1: r['HF 1']||r['HF1']||'',
          hf2: r['HF 2']||r['HF2']||'',
          auswertung: r['Auswertung']||'',
          anmerkung: r['Anmerkungen']||r['Anmerkung']||'',
          jahr: parseInt(r['Jahr']||'')||0,
          datum: r['Datum']||''
        });
      });
      DATA.hilfsfristen = parsed;
      onSuccess(parsed.length);
    }
  };
  reader.readAsText(file, 'utf-8');
}

// Legacy-Kompatibilität
window.datenUpload = function(typ, file){
  var statusEl = document.getElementById('uploadStatus' + {brand:'Brand',rett:'Rett',hf:'HF'}[typ]);
  datenUploadSingle(typ, file, function(n){
    if(statusEl) statusEl.innerHTML='<span style="color:#276749;font-weight:600;">'+n+' Datensätze geladen</span>';
    updateDatenStatus();
  }, function(msg){
    if(statusEl) statusEl.innerHTML='<span style="color:#c0392b;">'+msg+'</span>';
  });
};

window.saveOrsKey = function(){
  var key = document.getElementById('orsKeyInput').value.trim();
  if(!key){document.getElementById('orsKeyStatus').innerHTML='<span style="color:#c0392b;">Bitte Key eingeben.</span>';return;}
  localStorage.setItem('ors_api_key', key);
  document.getElementById('orsKeyStatus').innerHTML='<span style="color:#276749;">Gespeichert.</span>';
};
// ORS Key beim Laden wiederherstellen
(function(){
  var saved = localStorage.getItem('ors_api_key');
  if(saved){
    var inp = document.getElementById('orsKeyInput');
    if(inp) inp.value = saved;
  }
})();

window.exportCSV = function(typ){
  var data, filename, headers;
  if(typ==='brand'){
    data=DATA.incidents||[]; filename='einsaetze_brandschutz.csv';
    headers=['lat','lon','nr','ort','st','ad','hn','sw','dt','yr','mo','ob'];
  } else if(typ==='rett'){
    data=DATA.incidents_rett||[]; filename='einsaetze_rettungsdienst.csv';
    headers=['lat','lon','nr','ort','st','ad','hn','sw','dt','yr','mo','ob'];
  } else if(typ==='hf'){
    data=DATA.hilfsfristen||[]; filename='hilfsfristen.csv';
    headers=['lat','lon','nr','kommune','stadtteil','strasse','stichwort','wache','hf1','hf2','auswertung','anmerkung','jahr','datum'];
  }
  if(!data||!data.length){document.getElementById('exportStatus').innerHTML='<span style="color:#c0392b;">Keine Daten geladen.</span>';return;}
  var csv = headers.join(';')+'\n';
  data.forEach(function(r){csv+=headers.map(function(h){return r[h]||'';}).join(';')+'\n';});
  var blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
  document.getElementById('exportStatus').innerHTML='<span style="color:#276749;">'+filename+' exportiert ('+data.length+' Zeilen).</span>';
};

window._reloadEinsaetze = function(){

  // ── 1. Orts-Checkboxen komplett neu aufbauen (UNGECHECKED) ───────────
  var folist = document.getElementById('folist');
  if(folist){
    folist.innerHTML = '';
    var allOrteNeu = [];
    DATA.incidents.forEach(function(i){ if(i.ort && !allOrteNeu.includes(i.ort)) allOrteNeu.push(i.ort); });
    allOrteNeu.sort();
    allOrteNeu.forEach(function(v){
      var l = document.createElement('label');
      l.style.display = 'block';
      l.innerHTML = '<input type="checkbox" class="ortc" value="'+v.replace(/"/g,'&quot;')+'"> '+v;
      folist.appendChild(l);
    });
    // onchange-Handler neu binden: Kommune ↔ Stadtteile koppeln
    document.querySelectorAll('.ortc').forEach(function(c){
      c.onchange = function(){
        var ort = this.value;
        var checked = this.checked;
        var stsOfOrt = new Set(DATA.incidents.filter(function(i){return i.ort===ort;}).map(function(i){return i.st;}));
        if(typeof refillSt==='function') refillSt();
        // Stadtteile dieses Orts synchron setzen (Kommune an → Stadtteile an, Kommune aus → Stadtteile aus)
        document.querySelectorAll('.stc').forEach(function(stc){
          if(stsOfOrt.has(stc.value)) stc.checked = checked;
        });
        if(typeof updOrtInfo==='function') updOrtInfo();
        if(typeof updStInfo==='function') updStInfo();
        if(typeof update==='function') update();
        if(typeof updateHFLayer==='function') updateHFLayer();
      };
    });
    if(typeof updOrtInfo==='function') updOrtInfo();
  }

  // ── 2. Stadtteil-Checkboxen neu aufbauen (werden über refillSt gesteuert) ──
  if(typeof refillSt==='function') refillSt();

  // ── 3. Jahres-Checkboxen neu aufbauen (UNGECHECKED) ──────────────────
  var yrlist = document.getElementById('yrlist');
  if(yrlist){
    yrlist.innerHTML = '';
    var allYRneu = [];
    DATA.incidents.forEach(function(i){ if(i.yr && !allYRneu.includes(i.yr)) allYRneu.push(i.yr); });
    allYRneu.sort();
    allYRneu.forEach(function(y){
      var l = document.createElement('label');
      l.style.fontSize = '12px';
      l.innerHTML = '<input type="checkbox" class="yc" value="'+y+'"> '+y;
      yrlist.appendChild(l);
    });
    document.querySelectorAll('.yc').forEach(function(c){
      c.onchange = function(){
        if(typeof updYrInfo==='function') updYrInfo();
        if(typeof update==='function') update();
      };
    });
    if(typeof updYrInfo==='function') updYrInfo();
  }

  // ── 4. Stichwort-Checkboxen neu aufbauen (UNGECHECKED) ───────────────
  var fwlist = document.getElementById('fwlist');
  if(fwlist){
    fwlist.innerHTML = '';
    var allSWneu = [];
    DATA.incidents.forEach(function(i){ if(i.sw && !allSWneu.includes(i.sw)) allSWneu.push(i.sw); });
    allSWneu.sort();
    allSWneu.forEach(function(v){
      var l = document.createElement('label');
      l.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer;margin-bottom:2px;';
      l.innerHTML = '<input type="checkbox" class="swc" value="'+v+'"> '+v;
      fwlist.appendChild(l);
    });
    document.querySelectorAll('.swc').forEach(function(c){
      c.onchange = function(){
        if(typeof updFwInfo==='function') updFwInfo();
        if(typeof update==='function') update();
      };
    });
    if(typeof updFwInfo==='function') updFwInfo();
  }

  // ── 5. STADTTEILE für AAO Ortskern neu aufbauen ───────────────────────
  window.STADTTEILE = {};
  DATA.incidents.forEach(function(e){
    if(!e.ort||!e.st||e.st===e.ort) return;
    if(!window.STADTTEILE[e.ort]) window.STADTTEILE[e.ort] = new Set();
    window.STADTTEILE[e.ort].add(e.st);
  });
  Object.keys(window.STADTTEILE).forEach(function(k){
    window.STADTTEILE[k] = Array.from(window.STADTTEILE[k]).sort();
  });

  // ── 6. Einsatz-Button auf "einblenden" zurücksetzen ──────────────────
  // Beim Neu-Laden nach Upload: Einsätze nicht automatisch zeigen
  if(typeof window.einsHidden!=='undefined'){
    window.einsHidden = true;
    var b = document.getElementById('toggleEins');
    if(b){
      b.textContent = 'Einsätze einblenden';
      b.style.background = '#b80000';
      b.style.color = '#fff';
    }
  }

  // ── 7. Einsatz-Layer neu zeichnen ─────────────────────────────────────
  if(typeof update==='function') update();

  // ── 8. AAO Ortskern-Dropdown aktualisieren ────────────────────────────
  var ortSel = document.getElementById('aaoOrtSelect');
  if(ortSel && ortSel.value && typeof window.aaoOrtChanged==='function'){
    window.aaoOrtChanged();
  }
};