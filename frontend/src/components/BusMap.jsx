import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Maximize2, LocateFixed, Eye } from 'lucide-react';

const MAP_LAYERS = {
  streets: {
    name: 'Roadmap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  light: {
    name: 'Transit Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }
};

export default function BusMap({ buses, stops, selectedBus, onSelectBus }) {
  const mapRef = useRef(null);
  const leafletInstance = useRef(null);
  const activeTileLayer = useRef(null);
  const markersRef = useRef({});
  const [currentLayer, setCurrentLayer] = useState('streets');

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletInstance.current) {
      const map = L.map(mapRef.current, {
        center: [12.9716, 77.5946],
        zoom: 12,
        zoomControl: false
      });

      // Add zoom control at bottom right to avoid clutter
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      activeTileLayer.current = L.tileLayer(MAP_LAYERS.streets.url, {
        attribution: MAP_LAYERS.streets.attribution,
        maxZoom: 19
      }).addTo(map);

      leafletInstance.current = map;
    }
  }, []);

  // Handle Layer switching
  useEffect(() => {
    if (!leafletInstance.current) return;
    const map = leafletInstance.current;
    if (activeTileLayer.current) {
      map.removeLayer(activeTileLayer.current);
    }
    const layerConfig = MAP_LAYERS[currentLayer] || MAP_LAYERS.streets;
    activeTileLayer.current = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: 19
    }).addTo(map);
  }, [currentLayer]);

  // Update Markers when buses, stops or selection changes
  useEffect(() => {
    if (!leafletInstance.current) return;
    const map = leafletInstance.current;

    // Clear old markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    // 1. Render Stops
    if (stops && stops.length > 0) {
      stops.forEach(s => {
        if (!s.lat || !s.lon) return;
        const stopMarker = L.circleMarker([s.lat, s.lon], {
          radius: 5,
          color: '#77766F',
          fillColor: '#FFFFFF',
          fillOpacity: 1,
          weight: 2
        }).addTo(map);
        stopMarker.bindTooltip(s.name, { direction: 'top', offset: [0, -6], className: 'stop-tooltip' });
        markersRef.current[`stop_${s.id}`] = stopMarker;
      });
    }

    // 2. Render Bus Markers
    if (buses && buses.length > 0) {
      buses.forEach(b => {
        if (!b.lat || !b.lon) return;
        const isSelected = selectedBus && selectedBus.bus_id === b.bus_id;

        let statusColor = '#16A34A';
        let statusSymbol = '●';
        if (b.occupancy_status?.color === 'red') {
          statusColor = '#DC2626';
          statusSymbol = '▲';
        } else if (b.occupancy_status?.color === 'amber') {
          statusColor = '#D97706';
          statusSymbol = '■';
        }

        const busHtml = `
          <div style="
            background: #FFFFFF;
            color: #252521;
            border: 2px solid ${statusColor};
            box-shadow: ${isSelected ? '0 0 0 3px rgba(82, 107, 89, 0.4), 0 3px 8px rgba(0,0,0,0.2)' : '0 2px 5px rgba(0,0,0,0.15)'};
            border-radius: 20px;
            padding: 3px 8px;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 5px;
            white-space: nowrap;
            transform: translate(-50%, -50%);
            cursor: pointer;
            transition: transform 0.15s ease;
          ">
            <span style="color: ${statusColor}; font-size: 10px;">${statusSymbol}</span>
            <span>${b.vehicle_no.split('-').slice(-2).join('-')}</span>
            <span style="font-weight: 500; color: #77766F; font-size: 10px;">${b.occupancy_status?.pct}%</span>
          </div>
        `;

        const icon = L.divIcon({
          html: busHtml,
          className: 'bus-pin-icon',
          iconSize: [0, 0]
        });

        const busMarker = L.marker([b.lat, b.lon], { icon }).addTo(map);
        busMarker.on('click', () => {
          if (onSelectBus) onSelectBus(b);
        });

        markersRef.current[`bus_${b.bus_id}`] = busMarker;
      });
    }
  }, [buses, stops, selectedBus, onSelectBus]);

  // Center on selected bus
  const handleCenterOnSelected = () => {
    if (leafletInstance.current && selectedBus && selectedBus.lat && selectedBus.lon) {
      leafletInstance.current.setView([selectedBus.lat, selectedBus.lon], 14, { animate: true });
    }
  };

  // Fit all buses
  const handleFitAll = () => {
    if (!leafletInstance.current || !buses || buses.length === 0) return;
    const validCoords = buses.filter(b => b.lat && b.lon).map(b => [b.lat, b.lon]);
    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      leafletInstance.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Map Element */}
      <div ref={mapRef} className="map-container" />

      {/* Top Map Layer Selector & Actions Bar */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        padding: '4px 6px',
        borderRadius: '6px',
        border: '1px solid #E8E5DE',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', gap: '2px' }}>
          {Object.entries(MAP_LAYERS).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCurrentLayer(key)}
              style={{
                border: 'none',
                background: currentLayer === key ? '#526B59' : 'transparent',
                color: currentLayer === key ? '#FFFFFF' : '#77766F',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 500,
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '16px', background: '#E8E5DE', margin: '0 2px' }} />

        <button
          type="button"
          onClick={handleFitAll}
          title="Fit all buses in view"
          style={{
            border: 'none',
            background: 'transparent',
            padding: '4px 6px',
            borderRadius: '4px',
            color: '#252521',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px'
          }}
        >
          <Maximize2 size={12} />
          <span>Fit fleet</span>
        </button>

        {selectedBus && (
          <button
            type="button"
            onClick={handleCenterOnSelected}
            title="Center on selected bus"
            style={{
              border: 'none',
              background: '#EDF1EB',
              color: '#526B59',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 500
            }}
          >
            <LocateFixed size={12} />
            <span>Center bus</span>
          </button>
        )}
      </div>

      {/* Legend & Provider Notice */}
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        zIndex: 500,
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        padding: '6px 10px',
        borderRadius: '6px',
        border: '1px solid #E8E5DE',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        fontSize: '11px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: '#16A34A', fontSize: '10px' }}>●</span>
          <span style={{ color: '#77766F' }}>Space available (&lt;50%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: '#D97706', fontSize: '10px' }}>■</span>
          <span style={{ color: '#77766F' }}>Limited space (50-85%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ color: '#DC2626', fontSize: '10px' }}>▲</span>
          <span style={{ color: '#77766F' }}>At capacity (&gt;85%)</span>
        </div>
      </div>
    </div>
  );
}
