const $=id=>document.getElementById(id);

// Tab-Leiste: Brandschutz / Rettungsdienst / Katastrophenschutz
function switchTab(key){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.tab===key);
  });
  document.querySelectorAll('.tab-panel').forEach(p=>{
    p.classList.toggle('active',p.id==='panel-'+key);
  });
  // Leaflet braucht einen Redraw nachdem die Sidebar-Breite sich effektiv ändern könnte
  setTimeout(()=>{if(window.map)map.invalidateSize();},50);
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
  if(!$('shS').checked)return;
  const sel=selT();const prof=$('prof').value;
  const op=parseFloat($('op').value)/100;

  // Sichtbare Iso-Features sammeln
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
  // Pro aktiver Kommune: Kommune-Polygon minus Union aller aktiven Iso → roter Layer
  if($('showGap') && $('showGap').checked && typeof turf!=='undefined'
     && DATA.kommunen && DATA.kommunen.features){
    // Gruppiere "hulls" (größte Iso je Wache) nach Kommune
    const byKom={};
    hulls.forEach(f=>{
      const k=kommuneOf(f.properties.station_name);
      (byKom[k]=byKom[k]||[]).push(f);
    });
    const gapFeatures=[];
    Object.entries(byKom).forEach(([kom,polys])=>{
      const komFeat=DATA.kommunen.features.find(x=>x.properties.name===kom);
      if(!komFeat)return;
      try{
        // Union aller Iso dieser Kommune
        let union=polys[0];
        for(let i=1;i<polys.length;i++){
          const u=turf.union(turf.featureCollection([union,polys[i]]));
          if(u && u.geometry)union=u;
        }
        // Differenz: Kommune \ Union
        const diff=turf.difference(turf.featureCollection([komFeat,union]));
        if(diff && diff.geometry && (diff.geometry.coordinates||[]).length){
          diff.properties={kommune:kom};
          gapFeatures.push(diff);
        }
      }catch(err){/* degenerierte Geometrien ignorieren */}
    });
    if(gapFeatures.length){
      L.geoJSON({type:'FeatureCollection',features:gapFeatures},{
        style:()=>({color:'#c8102e',weight:1,fillColor:'#c8102e',fillOpacity:0.35,opacity:0.85,dashArray:'4,3'}),
        onEachFeature:(f,layer)=>{
          layer.bindPopup(
            '<div class="iso-popup">'
            +'<div class="iso-title" style="color:#c8102e;">⚠ Nicht abgedeckt</div>'
            +'<div class="iso-meta">Kommune: '+f.properties.kommune+'</div>'
            +'<div style="font-size:11px;line-height:1.4;">Dieser Bereich liegt innerhalb der Kommune <b>'+f.properties.kommune+'</b>, aber außerhalb der Reichweite der gewählten Wachen und Zeitstufen.</div>'
            +'</div>',{maxWidth:280}
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
$('shS').onchange=refreshW;
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
function updYrInfo(){const s=selYR();$('yrInfo').textContent='('+s.size+'/'+allYR.length+')';}
document.querySelectorAll('.yc').forEach(c=>c.onchange=()=>{updYrInfo();update();});
updYrInfo();
const allSW=uniq(DATA.incidents.map(i=>i.sw));
const fwlist=$('fwlist');
allSW.forEach(v=>{const l=document.createElement('label');l.style.display='block';l.innerHTML='<input type="checkbox" class="swc" value="'+v.replace(/"/g,'&quot;')+'"> '+v;fwlist.appendChild(l);});
function selSW(){return new Set([...document.querySelectorAll('.swc:checked')].map(c=>c.value));}
function updFwInfo(){const s=selSW();$('fwInfo').textContent=s.size===allSW.length?'(alle)':'('+s.size+'/'+allSW.length+')';}
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
function updStInfo(){const all=document.querySelectorAll('.stc').length;const s=selSt();$('fsInfo').textContent=s.size===all?'(alle)':'('+s.size+'/'+all+')';}
function setAllSt(v){document.querySelectorAll('.stc').forEach(c=>c.checked=v);updStInfo();update();}
refillSt();

let cl=L.markerClusterGroup(),pts=L.layerGroup(),heat=L.layerGroup(),unc=L.layerGroup(),heatClick=L.layerGroup();
let einsHidden=true;
function toggleEinsaetze(){einsHidden=!einsHidden;const b=document.getElementById('toggleEins');if(einsHidden){[cl,pts,heat,unc,heatClick].forEach(l=>{if(map.hasLayer(l))map.removeLayer(l);});b.textContent='Einsätze einblenden';b.style.background='#b80000';b.style.color='#fff';}else{b.textContent='Einsätze ausblenden';b.style.background='';b.style.color='';update();}}
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
  if(einsHidden)return;
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
    fiRel.forEach(i=>{
      if(covered(i)===false){nc++;
        unc.addLayer(L.circleMarker([i.lat,i.lon],{radius:5,color:'#e63946',fillColor:'#e63946',fillOpacity:.9}).bindPopup(function(){
  const isoLabel = (function(){
    // Ermittle kleinste abdeckende Isochrone
    const profs = DATA.isochrones.features.filter(f=>
      f.properties.feature_type==='isochrone' &&
      f.properties.station_name && f.properties.profile==='LKW'
    );
    // Finde die Stufe bei der dieser Einsatz NICHT abgedeckt ist
    // (wir zeigen die konfigurierte Hilfsfrist aus dem Slider)
    const hfMin = parseInt(document.getElementById('hfMin')?.value||'8');
    return hfMin + ' Min';
  })();
  return '<div style="font-family:sans-serif;font-size:12px;min-width:240px;">'
    +'<div style="background:#c0392b;color:#fff;padding:6px 10px;margin:-1px -1px 8px -1px;'
    +'border-radius:3px 3px 0 0;font-weight:700;font-size:12px;letter-spacing:0.3px;">'
    +'\u26a0\ufe0f Nicht abgedeckter Einsatz</div>'
    +'<div style="color:#c0392b;font-size:11px;margin-bottom:8px;padding:0 2px;">'
    +'Einsatz in der Isochrone '+isoLabel+' nicht abgedeckt.</div>'
    + popup(i)
    +'<div style="margin-top:8px;padding:5px 6px;background:#f8f8f8;border-left:3px solid #2980b9;'
    +'font-size:10.5px;color:#555;line-height:1.4;">'
    +'\u2139\ufe0f F\u00fcr detaillierte Hilfsfristanalyse \u2192 Reiter \u201eHilfsfrist\u201c'
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
  if($('mode').value!=='heat'||!map._heatFi)return;
  const R_M=175; // Meter Umkreis
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

// AAO-Analyse
// ════════════════════════════════════════════════════════════════
(function(){
  var EINSATZ_IDX = {};
  DATA.incidents.forEach(function(e){ EINSATZ_IDX[String(e.nr)] = e; });

  var STADTTEILE = {};
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

  var aaoProfile='lkw', aaoRouteLayers=[], aaoTargetMarker=null;
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
  function aaoClearRoutes(){ aaoRouteLayers.forEach(function(l){ map.removeLayer(l); }); aaoRouteLayers=[]; }

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
      el.innerHTML='<b style="c<b style=\"color:#744210\">Offline-Modus \u2013 Isochronen-Sch\u00e4tzung</b>'+'<div style=\"margin-top:5px;line-height:1.5;\">Der Routing-Server ist in diesem Netzwerk nicht erreichbar. Fahrzeiten werden aus eingebetteten Isochronen berechnet.</div>'+'<div style=\"margin-top:5px;padding:5px 7px;background:#fef3cd;border-radius:3px;font-size:10.5px;line-height:1.5;\"><b>Berechnungsmethode:</b><br>'+'\u2022 <b>2\u20135 Min:</b> Kreispuffer – PKW: 700\u00a0m/Min (\u224242\u00a0km/h), LKW: 550\u00a0m/Min (\u224233\u00a0km/h)<br>'+'\u2022 <b>6, 8, 10, 12, 13, 15 Min:</b> Echte vorberechnete Isochronen (OSRM-Stra\u00dfendaten)<br>'+'\u2022 <b>7, 9, 11, 14, 16 Min:</b> Interpolierte Isochronen (skalierte N\u00e4herung)<br>'+'\u2022 Alle Werte sind N\u00e4herungen (\u2248) \u2013 kein Live-Routing</div>'+'<div style=\"margin-top:4px;font-size:10.5px;color:#92400e;\">Tipp: Bei Internetzugang wird automatisch auf OSRM-Routing umgeschaltet.</div>';
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
    var st=STADTTEILE[ort]||[];
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
        +'<a href="#" onclick="(function(){'
        +'aaoRouteLayers.forEach(function(l,i){'
        +'try{l.setStyle({opacity:0.85,weight:i<3?4:2.5});}catch(e){}});'
        +'document.querySelectorAll(\'.aao-item\').forEach(function(x){x.classList.remove(\'sel\');});'
        +'map.closePopup();})();return false;" style="color:#2b6cb0;font-size:10.5px">Alle Routen anzeigen</a>'+'</div></div>'
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
    if(aaoRoutesVisible){
      aaoRouteLayers.forEach(function(l){ map.removeLayer(l); });
      btn.textContent='Routen einblenden';
    } else {
      // Alle Routen einblenden + Dimming vollständig zurücksetzen
      aaoRouteLayers.forEach(function(l,i){
        l.addTo(map);
        l.setStyle({opacity:0.85, weight: i<3?4:2.5});
      });
      // Alle Items-Selektion aufheben
      document.querySelectorAll('.aao-item').forEach(function(x){ x.classList.remove('sel'); });
      btn.textContent='Routen ausblenden';
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
    document.getElementById('aaoAdrInput').value='';
    nrInput.value=''; if(nrClear) nrClear.style.display='none'; if(nrSugg) nrSugg.style.display='none';
    document.getElementById('aaoEinsInfo').style.display='none';
    document.getElementById('aaoOrtSelect').value='';
    document.getElementById('aaoStadtteilWrap').style.display='none';
    aaoModus='unbekannt'; aaoUpdateModusHinweis();
    aaoSetStatus(''); aaoLastResults=[];
  };

  // Hinweis initial setzen
  aaoUpdateModusHinweis();

})();
// ════════════════════════════════════════════════════════════════
