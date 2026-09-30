// Charger & place data. Coordinates were looked up (not guessed), Sep 2026:
//  - "osm"      = OpenStreetMap charging_station / POI (Overpass or Nominatim)
//  - "pc"       = postcodes.io postcode centroid
//  - "plugshare"= PlugShare listing coordinates
// Prices: check in app; last checked Sep 2026.
window.EV3_PLACES = [
  { id: 'home',   kind: 'home',   name: 'Home – Kirkintilloch', note: 'Approximate town centre (no home charger)', lat: 55.938391, lng: -4.154905, src: 'osm' },
  { id: 'studio', kind: 'work',   name: 'Podcast Studio Glasgow', note: '279 Abercromby Street, Glasgow G40 2DD · Mon–Fri', lat: 55.851304, lng: -4.228445, src: 'pc G40 2DD' },
  { id: 'gym',    kind: 'gym',    name: 'PureGym Robroyston', note: 'Auchinleck Drive, Robroyston G33 1PW', lat: 55.891147, lng: -4.184079, src: 'osm' }
];

window.EV3_CHARGERS = [
  { id: 'crownpoint', name: 'Crown Point Community Garden', addr: 'Crownpoint Rd, Glasgow G40 2AL',
    network: 'ChargePlace Scotland', type: 'ac', kw: 22, speed: '3 units, 2× Type 2 each at 22 kW (EV3 draws 11 kW AC)',
    price: 40, fee: 1, priceText: '£1 connection fee + 40p/kWh · £40 overstay',
    notes: 'Max stay unconfirmed (3h or 12h) – check signage. 5–8 min walk from the studio.',
    lat: 55.853421, lng: -4.221696, src: 'pc G40 2AL' },
  { id: 'robroyston', name: 'Robroyston Station Park & Ride', addr: 'Robroyston, Glasgow G33 6NQ',
    network: 'ChargePlace Scotland', type: 'rapid', kw: 52, speed: 'Rapid 52 kW CCS/CHAdeMO + 44 kW AC; plus 3× 7 kW',
    price: 43, fee: 0, priceText: '43p/kWh', notes: 'Pay with CPS app or Zap-Pay. About 1 km from PureGym.',
    lat: 55.886948, lng: -4.174712, src: 'osm charging_station' },
  { id: 'tesla-stepps', name: 'Tesla Supercharger Stepps', addr: 'M80 J3, Stepps G33 6DE',
    network: 'Tesla (open to all brands)', type: 'rapid', kw: 250, speed: '8× 250 kW',
    price: 55, fee: 0, priceText: '~55p/kWh (46p with membership) – described as introductory', notes: 'Use the Tesla app.',
    lat: 55.900213, lng: -4.137918, src: 'osm charging_station' },
  { id: 'pogo-merkland', name: 'PoGo Charge Merkland Drive', addr: 'Merkland Drive, Kirkintilloch G66 3SJ',
    network: 'PoGo Charge', type: 'rapid', kw: null, speed: 'Rapid + ultra-rapid DC',
    price: 65, fee: 0, priceText: '65p/kWh DC', notes: 'Contactless or apps.',
    lat: 55.942259, lng: -4.130765, src: 'pc G66 3SJ' },
  { id: 'wpl', name: 'William Patrick Library car park', addr: 'West High Street, Kirkintilloch G66 1AD',
    network: 'ChargePlace Scotland / East Dunbartonshire Council', type: 'rapid', kw: 80, speed: '80 kW rapid',
    price: 70, fee: 0, priceText: '70p/kWh · 60 min max stay · £30 overstay', notes: '60-minute max stay.',
    lat: 55.941476, lng: -4.159084, src: 'osm library' },
  { id: 'kirkie-leisure', name: 'Kirkintilloch Leisure Centre', addr: 'Initiative Road, Kirkintilloch G66',
    network: 'ChargePlace Scotland', type: 'ac', kw: 22, speed: '2× 22 kW AC (EV3 draws 11 kW)',
    price: 40, fee: 0, priceText: '40p/kWh', notes: 'Pin is the leisure centre building (OSM); council site listed these as awaiting grid connection – check live status.',
    lat: 55.932541, lng: -4.150532, src: 'osm sports_centre' },
  { id: 'eastside', name: 'Eastside, Kirkintilloch', addr: '34–41 Eastside, Kirkintilloch G66 1QA',
    network: 'ChargePlace Scotland', type: 'ac', kw: 22, speed: '2× 22 kW AC (EV3 draws 11 kW)',
    price: 40, fee: 0, priceText: '40p/kWh', notes: 'Council-owned dual 22 kW posts, free parking.',
    lat: 55.942123, lng: -4.152656, src: 'plugshare / pc G66 1QA' },
  { id: 'donaldson', name: 'Donaldson Street (Southbank)', addr: 'Donaldson Street, Kirkintilloch G66 1XQ',
    network: 'ChargePlace Scotland', type: 'ac', kw: 22, speed: '7 and 22 kW AC',
    price: 40, fee: 0, priceText: '40p/kWh', notes: 'Southbank Business Park.',
    lat: 55.934449, lng: -4.158097, src: 'pc G66 1XQ' },
  { id: 'lenzie', name: 'Lenzie Station South car park', addr: 'Alexandra Avenue, Lenzie G66 5BG',
    network: 'ChargePlace Scotland', type: 'ac', kw: 7, speed: '7 kW AC',
    price: 40, fee: 0, priceText: '40p/kWh', notes: 'Slow – best for long stays.',
    lat: 55.920147, lng: -4.156758, src: 'pc G66 5BG' },
  { id: 'osprey', name: 'Osprey – Old Gatehouse', addr: 'Woodilee Rd, Kirkintilloch G66 3FB',
    network: 'Osprey', type: 'rapid', kw: 75, speed: '3× 75 kW CCS',
    price: 82, fee: 0, priceText: '82p/kWh', notes: 'Contactless.',
    lat: 55.925512, lng: -4.142394, src: 'pc G66 3FB' },
  { id: 'iv-kirkie', name: 'InstaVolt Kirkie Filling Station', addr: 'Kirkintilloch G66 3HG',
    network: 'InstaVolt', type: 'rapid', kw: 50, speed: '50 kW',
    price: 92, fee: 0, priceText: '92p/kWh', notes: 'Contactless.',
    lat: 55.934826, lng: -4.137513, src: 'pc G66 3HG' },
  { id: 'iv-lowmoss', name: 'InstaVolt Lowmoss', addr: 'Bishopbriggs G64 2HS',
    network: 'InstaVolt', type: 'rapid', kw: 50, speed: '50 kW',
    price: 92, fee: 0, priceText: '92p/kWh', notes: 'Contactless.',
    lat: 55.919963, lng: -4.211675, src: 'pc G64 2HS' },
  { id: 'iv-stepps', name: 'InstaVolt Bannatyne Stepps', addr: 'Stepps G33 6GL',
    network: 'InstaVolt', type: 'rapid', kw: 50, speed: '50 kW',
    price: 92, fee: 0, priceText: '92p/kWh', notes: 'Contactless.',
    lat: 55.892695, lng: -4.138553, src: 'pc G33 6GL' }
];
window.EV3_PRICE_NOTE = 'Prices: check in app; last checked Sep 2026.';
window.EV3_CPS_NOTE = 'ChargePlace Scotland is being wound down by Dec 2026 – prices, apps and payment methods at CPS sites may change.';
