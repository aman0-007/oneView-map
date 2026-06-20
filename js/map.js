// --- Custom MapLibre Control Class ---
class ComicLayerControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group comic-layer-ctrl';

        // Create the small toggle button
        const btn = document.createElement('button');
        btn.className = 'comic-ctrl-btn';
        
        // --- NEW: Genuine UI "Layers" Icon (SVG) ---
        // We use SVG to draw sharp, comic-style black outlines on a white background
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="#222222" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 12 12 17 22 12"></polyline>
                <polyline points="2 17 12 22 22 17"></polyline>
            </svg>
        `;
        btn.title = 'Toggle Layers';
        btn.style.backgroundColor = '#FFFFFF'; // Forces the stark white background

        // Create the expandable panel
        const panel = document.createElement('div');
        panel.className = 'comic-layer-panel';
        panel.innerHTML = `
            <label class="comic-toggle"><input type="checkbox" id="toggle-buildings" checked><span class="toggle-box"></span>3D Buildings</label>
            <label class="comic-toggle"><input type="checkbox" id="toggle-major-roads" checked><span class="toggle-box"></span>Major Roads</label>
            <label class="comic-toggle"><input type="checkbox" id="toggle-minor-roads" checked><span class="toggle-box"></span>Minor Streets</label>
            <label class="comic-toggle"><input type="checkbox" id="toggle-railways" checked><span class="toggle-box"></span>Train Tracks</label>
            <label class="comic-toggle"><input type="checkbox" id="toggle-stations" checked><span class="toggle-box"></span>Stations</label>
            <label class="comic-toggle"><input type="checkbox" id="toggle-hospitals" checked><span class="toggle-box"></span>Hospitals</label>
            <label class="comic-toggle"><input type="checkbox" id="toggle-schools" checked><span class="toggle-box"></span>Schools</label>
        `;

        // Toggle the dropdown when the button is clicked
        btn.onclick = () => {
            panel.classList.toggle('show');
        };

        this._container.appendChild(btn);
        this._container.appendChild(panel);

        return this._container;
    }

    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    // Initialize the MapLibre instance
    const map = new maplibregl.Map({
        container: 'map', 
        style: 'styles/comic-book-style.json', 
        center: [72.896, 19.052], // Chembur, Mumbai
        zoom: 14.5,
        pitch: 45, 
        bearing: -17.6,
        hash: true 
    });

    // Add zoom and rotation controls to the map
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Setup Live Tracking (Geolocation) Control
    const geolocate = new maplibregl.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: true 
        },
        trackUserLocation: true,     
        showUserHeading: true,       
        showAccuracyCircle: false    
    });

    // Add the button to the map
    map.addControl(geolocate, 'top-right');

    // --- 🛠️ FIX 1: Overriding the Zoom-Out Bug ---
    let initialLocationFound = false;

    geolocate.on('geolocate', (e) => {
        // Only force the camera jump on the VERY FIRST location ping
        if (!initialLocationFound) {
            const lon = e.coords.longitude;
            const lat = e.coords.latitude;
            
            map.flyTo({
                center: [lon, lat],
                zoom: 15.5, 
                essential: true 
            });
            
            initialLocationFound = true; // Set flag to true so this code doesn't run again
        }
    });

    // If the user manually turns off location tracking, reset the flag
    // so the zoom-in effect works the next time they click the button!
    geolocate.on('trackuserlocationend', () => {
        initialLocationFound = false;
    });

    // --- 🛠️ FIX 2: Tamed Dynamic Marker Scaling ---
    function updateMarkerScale() {
        const zoom = map.getZoom();
        
        // Base scale is 1 at zoom level 14.5. 
        // We tightened the limits: never shrinks below 0.7, never grows above 1.3.
        const scale = Math.max(0.7, Math.min(1.3, (zoom - 10) / 4.5));
        
        // Pass this scale value directly to our CSS
        document.documentElement.style.setProperty('--marker-scale', scale);
    }

    // Update the scale every time the user scrolls/zooms
    map.on('zoom', updateMarkerScale);
    
    map.on('load', () => {
        console.log('Comic book map loaded successfully!');
        updateMarkerScale(); 

        // ==========================================
        // 🎛️ MASTER UI LOGIC (INTEGRATED)
        // ==========================================

        // 1. Add our custom button to the top-right control stack!
        map.addControl(new ComicLayerControl(), 'top-right');

        // 2. The mapping logic
        const layerGroups = {
            'toggle-buildings': ['buildings-shadow', 'buildings-base-outline', 'buildings-3d'],
            'toggle-major-roads': ['roads-major-shadow', 'roads-major-casing', 'roads-major-fill', 'roads-major-center-line', 'road-labels'],
            'toggle-minor-roads': ['roads-minor-casing', 'roads-minor-fill'],
            'toggle-railways': ['railway-casing', 'railway-dashes'],
            'toggle-stations': ['station-markers', 'station-labels'],
            'toggle-hospitals': ['hospital-icons', 'hospital-labels'], // New!
            'toggle-schools': ['school-icons', 'school-labels']        // New!
        };

        // 3. We must use setTimeout to wait 100ms for MapLibre to finish injecting 
        // our custom HTML into the webpage before we try to attach click listeners to it.
        setTimeout(() => {
            Object.keys(layerGroups).forEach(checkboxId => {
                const checkbox = document.getElementById(checkboxId);
                if(checkbox) {
                    checkbox.addEventListener('change', function(e) {
                        const visibility = e.target.checked ? 'visible' : 'none';
                        layerGroups[checkboxId].forEach(layerId => {
                            if (map.getLayer(layerId)) {
                                map.setLayoutProperty(layerId, 'visibility', visibility);
                            }
                        });
                    });
                }
            });
        }, 100);
    });
});