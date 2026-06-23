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

        // ==========================================
        // 🚀 SUPERHERO ROUTING MODE (LIVE TRACKING)
        // ==========================================

        if (typeof turf === 'undefined') {
            alert("SYSTEM ERROR: Turf.js is missing! Please add it to index.html.");
            return;
        }

        let userLocation = null;
        let destinationMarker = null;
        let lineAnimationId = null;
        let currentRoutePath = null;
        let isLiveNavigating = false; // Tracks if we are in active driving mode

        const startBtn = document.getElementById('start-btn');
        const distanceBadge = document.getElementById('distance-badge');

        // 1. Capture the user's live location and lock camera if driving
        geolocate.on('geolocate', (e) => {
            userLocation = [e.coords.longitude, e.coords.latitude];
            
            // If the user hit START, aggressively lock the camera to their live position
            if (isLiveNavigating) {
                map.easeTo({
                    center: userLocation,
                    zoom: 16.5,
                    pitch: 60, // Deep 3D tilt for "Driving Mode"
                    // If the phone compass provides a heading, rotate the map!
                    bearing: e.coords.heading || map.getBearing() 
                });
            }
        });

        // 2. Prepare the map layers
        map.addSource('route-source', {
            type: 'geojson',
            data: turf.featureCollection([])
        });

        map.addLayer({
            id: 'route-outline',
            type: 'line',
            source: 'route-source',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#222222', 'line-width': 14 }
        });

        map.addLayer({
            id: 'route-fill',
            type: 'line',
            source: 'route-source',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#FFD166', 'line-width': 8 }
        });

        map.addLayer({
            id: 'route-dashes',
            type: 'line',
            source: 'route-source',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#E63946', 'line-width': 4, 'line-dasharray': [1, 2] }
        });

        // ==========================================
        // 3. BULLETPROOF HOLD-TO-ROUTE SYSTEM
        // ==========================================

        // The Core Routing Function
        async function triggerHoldToRoute(lngLat) {
            if (!userLocation) {
                alert("Please tap the GPS target icon to find your location first!");
                return;
            }

            // Reset UI for a new route
            isLiveNavigating = false;
            startBtn.innerHTML = "START!";
            startBtn.style.backgroundColor = "#FFD166";
            startBtn.style.color = "#222222";
            startBtn.style.display = 'none';
            distanceBadge.style.display = 'none';
            if (lineAnimationId) cancelAnimationFrame(lineAnimationId);

            const destination = [lngLat.lng, lngLat.lat];

            if (destinationMarker) destinationMarker.remove();
            const el = document.createElement('div');
            el.className = 'destination-marker';
            destinationMarker = new maplibregl.Marker({ element: el }).setLngLat(destination).addTo(map);

            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLocation[0]},${userLocation[1]};${destination[0]},${destination[1]}?geometries=geojson&overview=full`;
            
            try {
                const response = await fetch(osrmUrl);
                const data = await response.json();
                
                if (data.routes && data.routes.length > 0) {
                    const fullRoute = data.routes[0].geometry;
                    currentRoutePath = turf.lineString(fullRoute.coordinates);
                    
                    // Calculate and display the total distance!
                    const totalDistance = turf.length(currentRoutePath, { units: 'kilometers' });
                    distanceBadge.innerHTML = `DISTANCE: ${totalDistance.toFixed(2)} KM`;
                    distanceBadge.style.display = 'block';

                    animateSuperheroPath(currentRoutePath);
                } else {
                    alert("No driving route found here!");
                }
            } catch (error) {
                console.error("Routing failed:", error);
            }
        }

        // 3A. LAPTOP DETECTOR (Right-click or two-finger tap)
        map.on('contextmenu', (e) => {
            triggerHoldToRoute(e.lngLat);
        });

        // 3B. MOBILE DETECTOR (Custom Touch Timer)
        let touchTimer = null;
        let touchStartCoords = null;

        map.on('touchstart', (e) => {
            if (e.originalEvent.touches.length > 1) return; // Ignore multi-touch (pinching)
            
            touchStartCoords = e.point; // Save start position
            
            // Start a 600ms timer
            touchTimer = setTimeout(() => {
                triggerHoldToRoute(e.lngLat); // BOOM! Trigger the route
                touchTimer = null;
            }, 600);
        });

        // If the finger moves more than 10 pixels, they are panning the map, so cancel the timer!
        map.on('touchmove', (e) => {
            if (!touchStartCoords || !touchTimer) return;

            const dist = Math.sqrt(
                Math.pow(e.point.x - touchStartCoords.x, 2) +
                Math.pow(e.point.y - touchStartCoords.y, 2)
            );
            
            if (dist > 10) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });

        // If finger lifts up early, cancel the timer!
        map.on('touchend', () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });
        map.on('touchcancel', () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        });

        // 4. Draw the route smoothly (Animation)
        function animateSuperheroPath(routeLine) {
            const totalDistance = turf.length(routeLine, { units: 'kilometers' });
            let currentDistance = 0.01; 
            const speed = totalDistance / 150; 

            function drawFrame() {
                currentDistance += speed;

                if (currentDistance >= totalDistance) {
                    map.getSource('route-source').setData(routeLine);
                    startBtn.style.display = 'block'; 
                    return;
                }

                const segment = turf.lineSliceAlong(routeLine, 0, currentDistance, { units: 'kilometers' });
                map.getSource('route-source').setData(segment);
                lineAnimationId = requestAnimationFrame(drawFrame);
            }

            drawFrame();
        }

        // 5. START / END LIVE JOURNEY
        startBtn.addEventListener('click', () => {
            if (isLiveNavigating) {
                // If already navigating, this acts as the "END" button
                isLiveNavigating = false;
                startBtn.style.display = 'none';
                distanceBadge.style.display = 'none';
                map.getSource('route-source').setData(turf.featureCollection([]));
                if (destinationMarker) destinationMarker.remove();
                
                // Return camera to a relaxed top-down view
                map.easeTo({ pitch: 45, zoom: 15.5 });

            } else {
                // Start Real Live Navigation!
                isLiveNavigating = true;
                
                // Change button to an "END JOURNEY" kill switch
                startBtn.innerHTML = "END JOURNEY";
                startBtn.style.backgroundColor = "#E63946"; // Red color
                startBtn.style.color = "#FFFFFF";
                
                // Instantly snap the camera to the user's live position in 3D driving mode
                map.flyTo({
                    center: userLocation,
                    zoom: 16.5,
                    pitch: 60
                });
            }
        });

        // ==========================================
        // 🏥 HOSPITAL & 🎓 SCHOOL DOSSIER LOGIC
        // ==========================================

        const hospitalUi = document.getElementById('hospital-ui');
        const hospitalNameDisplay = document.getElementById('hospital-name-display');
        const schoolUi = document.getElementById('school-ui');
        const schoolNameDisplay = document.getElementById('school-name-display');
        
        let selectedPoiCoords = null; 

        // --- 1. Hospital Clicks ---
        map.on('click', 'hospital-icons', (e) => {
            schoolUi.classList.remove('open'); // Close school panel if open
            const feature = e.features[0];
            selectedPoiCoords = feature.geometry.coordinates.slice();
            hospitalNameDisplay.innerText = feature.properties.name || "Unknown Medical Center";
            
            hospitalUi.classList.add('open');

            // FIX: Uses pixel offsets to keep building visible on the left side of the screen
            map.easeTo({
                center: selectedPoiCoords,
                offset: [60, 0], // Smoothly nudge camera right to keep point clear of panel
                duration: 400
            });
        });

        // --- 2. School Clicks ---
        map.on('click', 'school-icons', (e) => {
            hospitalUi.classList.remove('open'); // Close hospital panel if open
            const feature = e.features[0];
            selectedPoiCoords = feature.geometry.coordinates.slice();
            schoolNameDisplay.innerText = feature.properties.name || "Unknown School Facility";
            
            schoolUi.classList.add('open');

            // Uses the identical pixel-perfect alignment strategy
            map.easeTo({
                center: selectedPoiCoords,
                offset: [60, 0],
                duration: 400
            });
        });

        // --- 3. Hover Adjustments for Interactive Layers ---
        map.on('mouseenter', 'hospital-icons', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'hospital-icons', () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'school-icons', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'school-icons', () => { map.getCanvas().style.cursor = ''; });

        // --- 4. Panel Close Listeners ---
        document.getElementById('close-dossier').addEventListener('click', () => {
            hospitalUi.classList.remove('open');
            selectedPoiCoords = null;
        });
        document.getElementById('close-school-dossier').addEventListener('click', () => {
            schoolUi.classList.remove('open');
            selectedPoiCoords = null;
        });

        // --- 5. Integrated Action Router Function ---
        async function triggerDossierRoute(destinationCoords) {
            if (!userLocation) {
                alert("Please tap the GPS target icon to find your location first!");
                return;
            }
            
            hospitalUi.classList.remove('open');
            schoolUi.classList.remove('open');

            if (lineAnimationId) cancelAnimationFrame(lineAnimationId);
            if (destinationMarker) destinationMarker.remove();
            
            const el = document.createElement('div');
            el.className = 'destination-marker';
            destinationMarker = new maplibregl.Marker({ element: el })
                .setLngLat(destinationCoords)
                .addTo(map);

            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLocation[0]},${userLocation[1]};${destinationCoords[0]},${destinationCoords[1]}?geometries=geojson&overview=full`;
            
            try {
                const response = await fetch(osrmUrl);
                const data = await response.json();
                
                if (data.routes && data.routes.length > 0) {
                    const fullRoute = data.routes[0].geometry;
                    currentRoutePath = turf.lineString(fullRoute.coordinates);
                    
                    const totalDistance = turf.length(currentRoutePath, { units: 'kilometers' });
                    distanceBadge.innerHTML = `DISTANCE: ${totalDistance.toFixed(2)} KM`;
                    distanceBadge.style.display = 'block';

                    animateSuperheroPath(currentRoutePath);
                }
            } catch (error) {
                console.error("Routing failed:", error);
            }
        }

        // Connect action buttons directly to the router
        document.getElementById('dossier-route-btn').addEventListener('click', () => {
            if (selectedPoiCoords) triggerDossierRoute(selectedPoiCoords);
        });
        document.getElementById('school-dossier-route-btn').addEventListener('click', () => {
            if (selectedPoiCoords) triggerDossierRoute(selectedPoiCoords);
        });


        // ==========================================
        // 🔍 OPEN-SOURCE SEARCH ENGINE LOGIC
        // ==========================================

        const searchInput = document.getElementById('place-search-input');
        const searchResultsDropdown = document.getElementById('search-results-dropdown');
        const clearSearchBtn = document.getElementById('search-clear-btn');

        // Toggle Expand
        searchToggleBtn.addEventListener('click', () => {
            searchContainer.classList.remove('collapsed');
            searchContainer.classList.add('expanded');
            searchInput.focus(); // Automatically pull up the mobile keyboard!
        });

        // Toggle Collapse
        searchCollapseBtn.addEventListener('click', () => {
            searchContainer.classList.remove('expanded');
            searchContainer.classList.add('collapsed');
            searchInput.value = '';
            searchResultsDropdown.style.display = 'none';
            clearSearchBtn.style.display = 'none';
        });
        
        let searchTimeout = null;

        // 1. Listen for typing in the search bar
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            // Show/Hide the clear button
            clearSearchBtn.style.display = query.length > 0 ? 'block' : 'none';

            if (query.length < 3) {
                searchResultsDropdown.style.display = 'none';
                return;
            }

            // Debounce: Wait 500ms after they stop typing before hitting the API
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(query);
            }, 500);
        });

        // 2. Fetch data from OpenStreetMap's free Geocoder (Nominatim)
        async function performSearch(query) {
            // We add 'Mumbai' to the query behind the scenes to prioritize local results!
            const apiUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Mumbai')}&limit=5`;
            
            try {
                const response = await fetch(apiUrl);
                const data = await response.json();
                
                displaySearchResults(data);
            } catch (error) {
                console.error("Search failed:", error);
            }
        }

        // 3. Display the results in the Dropdown
        function displaySearchResults(results) {
            searchResultsDropdown.innerHTML = ''; // Clear old results

            if (results.length === 0) {
                searchResultsDropdown.innerHTML = '<div class="search-result-item" style="color: #E63946;">NO HIDEOUTS FOUND!</div>';
                searchResultsDropdown.style.display = 'block';
                return;
            }

            results.forEach(place => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                
                // Clean up the name so it isn't too long
                const shortName = place.display_name.split(',').slice(0, 2).join(',');
                item.innerText = `📍 ${shortName}`;
                
                // 4. WHAT HAPPENS WHEN YOU CLICK A RESULT!
                item.addEventListener('click', () => {
                    const lon = parseFloat(place.lon);
                    const lat = parseFloat(place.lat);
                    const destinationCoords = [lon, lat];

                    // Hide dropdown and clear text
                    searchResultsDropdown.style.display = 'none';
                    searchInput.value = '';
                    clearSearchBtn.style.display = 'none';

                    // Fly the camera to the searched place!
                    map.flyTo({
                        center: destinationCoords,
                        zoom: 15.5,
                        pitch: 45
                    });

                    // Wait 1 second for the camera to arrive, then draw the route!
                    setTimeout(() => {
                        // We reuse the awesome function we built in the last step!
                        if (typeof triggerDossierRoute === "function") {
                            triggerDossierRoute(destinationCoords);
                        } else {
                            alert("Routing engine not found!");
                        }
                    }, 1000);
                });

                searchResultsDropdown.appendChild(item);
            });

            searchResultsDropdown.style.display = 'block';
        }

        // 5. Clear Button Logic
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchResultsDropdown.style.display = 'none';
            clearSearchBtn.style.display = 'none';
        });
    });
});