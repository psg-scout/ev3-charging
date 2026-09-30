# EV3 Charging PWA
Static, self-contained PWA for a Kia EV3 GT-Line Long Range (81.4 kWh), no home charger.
Host the folder on any HTTPS static host (GitHub Pages, Netlify drop, etc.), open in iPhone Safari → Share → Add to Home Screen.
Files: index.html, styles.css, app.js, data.js (charger data + coordinates), sw.js, manifest.json, icons/, calendar/ev3-monday-charge.ics.
Data lives in localStorage on the device; use Settings → Export JSON to back up.
Local test: `python3 -m http.server 8080` then open http://localhost:8080/.
Coordinates: OpenStreetMap (Overpass/Nominatim), postcodes.io centroids, PlugShare (Eastside). Prices: check in app; last checked Sep 2026.
