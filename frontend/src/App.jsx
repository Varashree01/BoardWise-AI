import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  MapPin, 
  Users, 
  QrCode, 
  Navigation, 
  Route, 
  Info, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  ArrowRight, 
  Clock, 
  Bus, 
  Footprints, 
  Menu, 
  X,
  Radio,
  ExternalLink
} from 'lucide-react';
import BusMap from './components/BusMap';

const API_BASE = '/api';

function getSessionId() {
  let sid = localStorage.getItem('boardwise_passenger_session');
  if (!sid) {
    sid = 'PASSENGER-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    localStorage.setItem('boardwise_passenger_session', sid);
  }
  return sid;
}

export default function App() {
  const [activeView, setActiveView] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [buses, setBuses] = useState([]);
  const [stops, setStops] = useState([]);
  const [routesList, setRoutesList] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [bmtcStatus, setBmtcStatus] = useState(null);
  
  // Passenger Journey & QR state
  const [sessionId] = useState(getSessionId());
  const [myJourneys, setMyJourneys] = useState([]);
  const [scannedBus, setScannedBus] = useState(null);
  const [selectedAlightingStop, setSelectedAlightingStop] = useState('');
  const [boardingMessage, setBoardingMessage] = useState(null);
  const [boardingError, setBoardingError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);

  // Simulation controls state
  const [selectedSimBusId, setSelectedSimBusId] = useState('');
  const [simAlert, setSimAlert] = useState(null);

  // AI Trip planner state
  const [plannerQuery, setPlannerQuery] = useState('');
  const [plannerResult, setPlannerResult] = useState(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState(null);

  useEffect(() => {
    fetchFleet();
    fetchStops();
    fetchRoutes();
    fetchBmtcStatus();
    fetchMyJourneys();

    const interval = setInterval(() => {
      fetchFleet();
      fetchMyJourneys();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const fetchFleet = async () => {
    try {
      const res = await fetch(`${API_BASE}/fleet`);
      if (res.ok) {
        const data = await res.json();
        setBuses(data.buses || []);
        if (!selectedSimBusId && data.buses?.length > 0) {
          setSelectedSimBusId(data.buses[0].bus_id);
        }
        if (selectedBus) {
          const updated = data.buses?.find(b => b.bus_id === selectedBus.bus_id);
          if (updated) setSelectedBus(updated);
        }
      }
    } catch (e) {
      console.error('Fleet fetch error', e);
    }
  };

  const fetchStops = async () => {
    try {
      const res = await fetch(`${API_BASE}/stops`);
      if (res.ok) {
        const data = await res.json();
        setStops(data.stops || []);
      }
    } catch (e) {
      console.error('Stops fetch error', e);
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await fetch(`${API_BASE}/routes`);
      if (res.ok) {
        const data = await res.json();
        setRoutesList(data.routes || []);
      }
    } catch (e) {
      console.error('Routes fetch error', e);
    }
  };

  const fetchBmtcStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/bmtc/status`);
      if (res.ok) {
        const data = await res.json();
        setBmtcStatus(data.bmtc);
      }
    } catch (e) {
      console.error('BMTC status error', e);
    }
  };

  const fetchMyJourneys = async () => {
    try {
      const res = await fetch(`${API_BASE}/journey/my?session_id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMyJourneys(data.journeys || []);
      }
    } catch (e) {
      console.error('My journeys fetch error', e);
    }
  };

  // QR Scanning & Boarding
  const handleScanBusQR = async (qrCode) => {
    setBoardingError(null);
    setBoardingMessage(null);
    setLoadingAction(true);
    try {
      const res = await fetch(`${API_BASE}/qr/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_code: qrCode })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setScannedBus(data);
        if (data.available_alighting_stops?.length > 0) {
          setSelectedAlightingStop(data.available_alighting_stops[0].stop_id);
        } else {
          setSelectedAlightingStop('');
        }
      } else {
        setBoardingError(data.message || 'QR code not recognized.');
        setScannedBus(null);
      }
    } catch {
      setBoardingError('Network error while scanning QR code.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirmBoarding = async () => {
    if (!scannedBus || !selectedAlightingStop) {
      setBoardingError('Please select your destination stop before boarding.');
      return;
    }
    setLoadingAction(true);
    setBoardingError(null);
    try {
      const res = await fetch(`${API_BASE}/journey/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_code: scannedBus.bus.qr_code,
          session_id: sessionId,
          alighting_stop_id: selectedAlightingStop
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setBoardingMessage(data.message);
        setScannedBus(null);
        fetchFleet();
        fetchMyJourneys();
        setActiveView('my_journey');
      } else {
        setBoardingError(data.message || 'Unable to confirm boarding.');
      }
    } catch {
      setBoardingError('Failed to record boarding. Check backend connection.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCancelJourney = async (journeyId) => {
    setLoadingAction(true);
    try {
      const res = await fetch(`${API_BASE}/journey/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey_id: journeyId,
          session_id: sessionId
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        fetchFleet();
        fetchMyJourneys();
      } else {
        alert(data.message || 'Could not cancel journey.');
      }
    } catch {
      alert('Error communicating with cancellation service.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Advance Bus Simulation
  const handleAdvanceBus = async () => {
    if (!selectedSimBusId) return;
    setLoadingAction(true);
    try {
      const res = await fetch(`${API_BASE}/fleet/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bus_id: selectedSimBusId })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSimAlert(data.message);
        fetchFleet();
        fetchMyJourneys();
        setTimeout(() => setSimAlert(null), 5000);
      }
    } catch (e) {
      console.error('Advance bus error', e);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleResetFleet = async () => {
    setLoadingAction(true);
    try {
      const res = await fetch(`${API_BASE}/fleet/reset`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSimAlert('Fleet state and occupancy reset to initial values.');
        fetchFleet();
        fetchMyJourneys();
        setTimeout(() => setSimAlert(null), 4000);
      }
    } catch (e) {
      console.error('Reset fleet error', e);
    } finally {
      setLoadingAction(false);
    }
  };

  // AI Trip Planner submit
  const handlePlanSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!plannerQuery.trim()) return;
    setPlannerLoading(true);
    setPlannerError(null);
    try {
      const res = await fetch(`${API_BASE}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: plannerQuery.trim() })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setPlannerResult(data);
      } else {
        setPlannerError(data.message || 'Route not found.');
      }
    } catch {
      setPlannerError('Could not reach backend planning service.');
    } finally {
      setPlannerLoading(false);
    }
  };

  const activeJourney = myJourneys.find(j => j.status === 'active');
  const totalPassengers = buses.reduce((acc, b) => acc + (b.estimated_occupancy || 0), 0);
  const totalCapacity = buses.reduce((acc, b) => acc + (b.capacity || 0), 0);
  const overallOccupancyPct = totalCapacity > 0 ? Math.round((totalPassengers / totalCapacity) * 100) : 0;

  const handleNavClick = (viewName) => {
    setActiveView(viewName);
    setSidebarOpen(false);
  };

  return (
    <div className="app-shell">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Persistent Left Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-row">
            <div className="brand-icon-box">
              <Compass size={18} strokeWidth={2.4} />
            </div>
            <div>
              <div className="brand-name">BoardWise AI</div>
              <div className="brand-tag">Bengaluru Transit Intelligence</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            type="button" 
            className={`nav-item ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => handleNavClick('overview')}
          >
            <Compass size={16} />
            <span>Overview</span>
          </button>

          <button 
            type="button" 
            className={`nav-item ${activeView === 'map' ? 'active' : ''}`}
            onClick={() => handleNavClick('map')}
          >
            <MapPin size={16} />
            <span>Live Bus Map</span>
          </button>

          <button 
            type="button" 
            className={`nav-item ${activeView === 'occupancy' ? 'active' : ''}`}
            onClick={() => handleNavClick('occupancy')}
          >
            <Users size={16} />
            <span>Passenger Occupancy</span>
          </button>

          <button 
            type="button" 
            className={`nav-item ${activeView === 'qr' ? 'active' : ''}`}
            onClick={() => handleNavClick('qr')}
          >
            <QrCode size={16} />
            <span>Scan / Bus QR</span>
          </button>

          <button 
            type="button" 
            className={`nav-item ${activeView === 'my_journey' ? 'active' : ''}`}
            onClick={() => handleNavClick('my_journey')}
          >
            <Navigation size={16} />
            <span>My Journey</span>
            {activeJourney && (
              <span className="badge badge-green" style={{ marginLeft: 'auto', fontSize: '9px', padding: '1px 5px' }}>
                Active
              </span>
            )}
          </button>

          <button 
            type="button" 
            className={`nav-item ${activeView === 'routes' ? 'active' : ''}`}
            onClick={() => handleNavClick('routes')}
          >
            <Route size={16} />
            <span>Routes & Stops</span>
          </button>

          <button 
            type="button" 
            className={`nav-item ${activeView === 'planner' ? 'active' : ''}`}
            onClick={() => handleNavClick('planner')}
          >
            <Footprints size={16} />
            <span>AI Trip Planner</span>
          </button>

          <button 
            type="button" 
            className={`nav-item ${activeView === 'about' ? 'active' : ''}`}
            onClick={() => handleNavClick('about')}
          >
            <Info size={16} />
            <span>About BoardWise</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div>Public Transport Intelligence</div>
          <div style={{ color: 'var(--accent)', fontWeight: 500 }}>Hackathon MVP v2.0</div>
        </div>
      </aside>

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Header Bar */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button 
              type="button"
              className="mobile-nav-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>

            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Namma BMTC Integrated Portal
            </span>
            <span className="badge badge-neutral">Demo Network</span>
          </div>

          <div className="top-status-group">
            <div className="status-pill" title="GPS tracking data source">
              <span className={`status-dot ${bmtcStatus?.is_live_available ? 'active' : 'warning'}`}></span>
              <span>{bmtcStatus?.is_live_available ? 'Live BMTC Gateway' : 'GPS Simulation'}</span>
            </div>

            <div className="status-pill" title="Passenger Session Identifier">
              <span>Session: {sessionId.split('-')[1]}</span>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="content-body">
          {/* Universal Simulation Advance Bar with Concise Non-Wrapping Labels */}
          <div className="sim-controls-bar">
            <div className="sim-controls-left">
              <span className="sim-label">Simulation:</span>
              
              <select 
                className="form-select"
                style={{ width: 'auto', maxWidth: '280px' }}
                value={selectedSimBusId}
                onChange={(e) => setSelectedSimBusId(e.target.value)}
              >
                {buses.map(b => (
                  <option key={b.bus_id} value={b.bus_id}>
                    {b.vehicle_no} ({b.route_id}) — At {b.current_stop_name}
                  </option>
                ))}
              </select>

              <button 
                type="button" 
                className="btn-primary"
                onClick={handleAdvanceBus}
                disabled={loadingAction}
                title="Moves bus to its next scheduled stop"
              >
                <Play size={12} />
                <span>Advance stop</span>
              </button>

              <button 
                type="button" 
                className="btn-secondary"
                onClick={handleResetFleet}
                disabled={loadingAction}
                title="Resets fleet state and occupancy"
              >
                <RotateCcw size={12} />
                <span>Reset demo</span>
              </button>
            </div>

            <span className="sim-controls-note">
              Reaching an alighting stop automatically completes passenger journeys.
            </span>
          </div>

          {/* Simulation Notification Alert */}
          {simAlert && (
            <div style={{
              backgroundColor: '#DCFCE7',
              border: '1px solid #BBF7D0',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 13px',
              fontSize: '13px',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <CheckCircle2 size={15} />
              <span>{simAlert}</span>
            </div>
          )}

          {/* --- VIEW 1: OVERVIEW --- */}
          {activeView === 'overview' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">Transit Network Overview</h1>
                  <p className="page-subtitle">Real-time fleet occupancy, vehicle coordinates, and passenger flow monitoring</p>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-label">Tracked Buses</div>
                  <div className="metric-val">{buses.length}</div>
                  <div className="metric-sub">Active corridors</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Est. Passengers</div>
                  <div className="metric-val">{totalPassengers}</div>
                  <div className="metric-sub">Onboard demo fleet</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Fleet Capacity</div>
                  <div className="metric-val">{overallOccupancyPct}%</div>
                  <div className="metric-sub">{totalPassengers} of {totalCapacity} seats</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">GPS Tracking</div>
                  <div className="metric-val" style={{ fontSize: '18px', color: 'var(--accent)' }}>
                    {bmtcStatus?.is_live_available ? 'Live BMTC' : 'Simulation'}
                  </div>
                  <div className="metric-sub">Verified corridor coordinates</div>
                </div>
              </div>

              {/* Map Preview */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '15px' }}>Fleet Position Map</h3>
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => setActiveView('map')}
                  >
                    <span>Full map</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
                
                <BusMap 
                  buses={buses} 
                  stops={stops} 
                  selectedBus={selectedBus} 
                  onSelectBus={(b) => setSelectedBus(b)} 
                />
              </div>
            </div>
          )}

          {/* --- VIEW 2: LIVE BUS MAP --- */}
          {activeView === 'map' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">Live Bus Map</h1>
                  <p className="page-subtitle">Vehicle locations, route stops, and crowd density across Bengaluru corridors</p>
                </div>
              </div>

              <BusMap 
                buses={buses} 
                stops={stops} 
                selectedBus={selectedBus} 
                onSelectBus={(b) => setSelectedBus(b)} 
              />

              {/* Selected Bus Floating Details Panel */}
              {selectedBus && (
                <div className="bus-detail-panel">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Bus size={18} color="var(--accent)" />
                      <span style={{ fontSize: '16px', fontWeight: 600 }}>{selectedBus.vehicle_no}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>({selectedBus.route_name})</span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span className={`badge badge-${selectedBus.occupancy_status?.color}`}>
                        {selectedBus.occupancy_status?.label}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setSelectedBus(null)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Current Stop:</span>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{selectedBus.current_stop_name}</div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Estimated Occupancy:</span>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>
                        {selectedBus.estimated_occupancy} / {selectedBus.capacity} seats ({selectedBus.occupancy_status?.pct}%)
                      </div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Coordinates:</span>
                      <div>{selectedBus.lat.toFixed(4)}, {selectedBus.lon.toFixed(4)}</div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>GPS Mode & Timestamp:</span>
                      <div>Simulation • {selectedBus.last_gps_update}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                    <button 
                      type="button" 
                      className="btn-primary"
                      onClick={() => {
                        handleScanBusQR(selectedBus.qr_code);
                        setActiveView('qr');
                      }}
                    >
                      Board this bus
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn-secondary"
                      onClick={() => {
                        setSelectedSimBusId(selectedBus.bus_id);
                        handleAdvanceBus();
                      }}
                    >
                      Advance stop
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Bus Cards List */}
              <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {buses.map(b => (
                  <div 
                    key={b.bus_id} 
                    className="card"
                    style={{
                      margin: 0,
                      padding: '14px',
                      cursor: 'pointer',
                      borderColor: selectedBus?.bus_id === b.bus_id ? 'var(--accent)' : 'var(--border-color)'
                    }}
                    onClick={() => setSelectedBus(b)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600 }}>{b.vehicle_no}</span>
                      <span className={`badge badge-${b.occupancy_status?.color}`}>
                        {b.occupancy_status?.pct}%
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      {b.route_name} • At <strong>{b.current_stop_name}</strong>
                    </div>

                    <div className="progress-bar-bg">
                      <div 
                        className={`progress-bar-fill ${b.occupancy_status?.color}`}
                        style={{ width: `${b.occupancy_status?.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- VIEW 3: PASSENGER OCCUPANCY DASHBOARD --- */}
          {activeView === 'occupancy' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">Passenger Occupancy</h1>
                  <p className="page-subtitle">Crowd estimation derived from passenger QR registrations and automatic alighting</p>
                </div>
              </div>

              {/* Prominent Required Disclaimer */}
              <div style={{
                backgroundColor: 'var(--surface-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '16px',
                lineHeight: 1.5
              }}>
                <strong>Notice:</strong> Occupancy is estimated from passenger QR registrations. It may differ from the actual number of passengers onboard. Does not guarantee seat availability.
              </div>

              {/* Occupancy Table */}
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Bus & Route</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Current Stop</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Estimated Onboard</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600, minWidth: '140px' }}>Capacity Meter</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buses.map(b => (
                      <tr key={b.bus_id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{b.vehicle_no}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{b.route_name}</div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 500 }}>{b.current_stop_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Updated: {b.last_gps_update}</div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>
                            {b.estimated_occupancy} <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 400 }}>/ {b.capacity} seats</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            ~{b.available_capacity} free
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Load</span>
                            <span style={{ fontWeight: 600 }}>{b.occupancy_status?.pct}%</span>
                          </div>
                          <div className="progress-bar-bg">
                            <div 
                              className={`progress-bar-fill ${b.occupancy_status?.color}`}
                              style={{ width: `${b.occupancy_status?.pct}%` }}
                            />
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span className={`badge badge-${b.occupancy_status?.color}`}>
                            {b.occupancy_status?.label}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <button 
                            type="button" 
                            className="btn-secondary"
                            style={{ height: '28px', padding: '3px 9px', fontSize: '12px' }}
                            onClick={() => {
                              handleScanBusQR(b.qr_code);
                              setActiveView('qr');
                            }}
                          >
                            Board bus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- VIEW 4: SCAN / BUS QR --- */}
          {activeView === 'qr' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">Bus QR Boarding</h1>
                  <p className="page-subtitle">Unique QR tokens per vehicle to record passenger boarding and intended alighting stops</p>
                </div>
              </div>

              {/* Scanned Bus Confirmation Card */}
              {scannedBus && (
                <div className="card" style={{ border: '2px solid var(--accent)', backgroundColor: '#FBFCFA' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>
                        QR Verified
                      </span>
                      <h2 style={{ fontSize: '17px', fontWeight: 600, marginTop: '2px' }}>
                        {scannedBus.bus.vehicle_no} — {scannedBus.bus.route_name}
                      </h2>
                    </div>
                    <span className="badge badge-green">Token Validated</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Current Boarding Station:</span>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{scannedBus.bus.current_stop_name}</div>
                    </div>

                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Onboard Occupancy:</span>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{scannedBus.bus.estimated_occupancy} / {scannedBus.bus.capacity} seats</div>
                    </div>

                    <div>
                      <label htmlFor="alight-stop-select" style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>
                        Select Alighting Stop:
                      </label>
                      <select 
                        id="alight-stop-select"
                        className="form-select"
                        style={{ width: '100%' }}
                        value={selectedAlightingStop}
                        onChange={(e) => setSelectedAlightingStop(e.target.value)}
                      >
                        {scannedBus.available_alighting_stops?.map(s => (
                          <option key={s.stop_id} value={s.stop_id}>
                            {s.stop_name} ({s.stops_away} stop{s.stops_away > 1 ? 's' : ''} away)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      className="btn-secondary"
                      onClick={() => setScannedBus(null)}
                    >
                      Cancel
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn-primary"
                      onClick={handleConfirmBoarding}
                      disabled={loadingAction}
                    >
                      <CheckCircle2 size={13} />
                      <span>Confirm boarding</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Boarding Error Alert */}
              {boardingError && (
                <div style={{
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FECACA',
                  padding: '9px 12px',
                  borderRadius: 'var(--radius-sm)',
                  color: '#991B1B',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px'
                }}>
                  <AlertCircle size={15} />
                  <span>{boardingError}</span>
                </div>
              )}

              {/* Demo QR Catalog */}
              <div className="card">
                <h3 style={{ fontSize: '15px', marginBottom: '4px' }}>
                  Demo QR Codes for Active Fleet
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Click any bus QR code below to simulate scanning it on a mobile device.
                </p>

                <div className="qr-grid">
                  {buses.map(b => (
                    <div 
                      key={b.bus_id} 
                      className="qr-card"
                      onClick={() => handleScanBusQR(b.qr_code)}
                    >
                      <div className="qr-preview-box">
                        <svg width="110" height="110" viewBox="0 0 100 100" fill="#252521">
                          <rect x="0" y="0" width="30" height="30" fill="#252521" />
                          <rect x="5" y="5" width="20" height="20" fill="#FFFFFF" />
                          <rect x="10" y="10" width="10" height="10" fill="#252521" />

                          <rect x="70" y="0" width="30" height="30" fill="#252521" />
                          <rect x="75" y="5" width="20" height="20" fill="#FFFFFF" />
                          <rect x="80" y="10" width="10" height="10" fill="#252521" />

                          <rect x="0" y="70" width="30" height="30" fill="#252521" />
                          <rect x="5" y="75" width="20" height="20" fill="#FFFFFF" />
                          <rect x="10" y="80" width="10" height="10" fill="#252521" />

                          <rect x="40" y="40" width="20" height="20" fill="#526B59" />
                          <rect x="45" y="10" width="10" height="10" fill="#252521" />
                          <rect x="10" y="45" width="10" height="10" fill="#252521" />
                          <rect x="70" y="70" width="10" height="10" fill="#252521" />
                          <rect x="85" y="85" width="15" height="15" fill="#252521" />
                        </svg>
                      </div>

                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{b.vehicle_no}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{b.route_name}</div>
                      
                      <button 
                        type="button" 
                        className="btn-primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                      >
                        Simulate scan
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --- VIEW 5: MY JOURNEY --- */}
          {activeView === 'my_journey' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">My Journey</h1>
                  <p className="page-subtitle">Active transit pass, vehicle location, and automatic alighting countdown</p>
                </div>
              </div>

              {myJourneys.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
                  <QrCode size={32} color="var(--text-tertiary)" style={{ margin: '0 auto 10px' }} />
                  <h3 style={{ fontSize: '15px' }}>No Active Journey</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '14px' }}>
                    Scan a bus QR code to board and monitor your route in real time.
                  </p>
                  <button 
                    type="button" 
                    className="btn-primary"
                    onClick={() => setActiveView('qr')}
                  >
                    Scan QR to board
                  </button>
                </div>
              ) : (
                myJourneys.map(j => {
                  const bus = buses.find(b => b.bus_id === j.bus_id);

                  return (
                    <div key={j.journey_id} className="ticket-card">
                      <div className="ticket-header">
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>
                            Digital Transit Pass • {j.journey_id}
                          </span>
                          <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: '2px' }}>
                            {j.vehicle_no} ({j.route_name})
                          </h2>
                        </div>

                        <div>
                          {j.status === 'active' && (
                            <span className="badge badge-green">Onboard Active</span>
                          )}
                          {j.status === 'completed' && (
                            <span className="badge badge-green">Destination Reached (Completed)</span>
                          )}
                          {j.status === 'cancelled' && (
                            <span className="badge badge-neutral">Exited / Cancelled</span>
                          )}
                        </div>
                      </div>

                      <div className="ticket-grid">
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Boarded At:</span>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{j.boarding_stop_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Time: {j.boarded_at}</div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Destination Stop:</span>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{j.alighting_stop_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Automatic count update enabled</div>
                        </div>

                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Bus Current Location:</span>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--accent)' }}>
                            {bus ? bus.current_stop_name : 'In Transit'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            {bus?.current_stop_id === j.alighting_stop_id ? 'Arrived at your stop!' : 'Approaching'}
                          </div>
                        </div>
                      </div>

                      {j.status === 'active' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Exiting before destination?
                          </span>

                          <button 
                            type="button" 
                            className="btn-danger"
                            onClick={() => handleCancelJourney(j.journey_id)}
                            disabled={loadingAction}
                          >
                            Exit early / Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* --- VIEW 6: ROUTES & STOPS --- */}
          {activeView === 'routes' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">Routes & Stops</h1>
                  <p className="page-subtitle">Bengaluru metropolitan corridors, stop sequences, and transfer hubs</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
                {routesList.map(r => (
                  <div key={r.id} className="card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{r.name}</span>
                      <span className="badge badge-neutral">Headway: {r.headway_mins}m</span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      Operator: {r.operator} • Mode: {r.mode.toUpperCase()}
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Stop sequence (actual route order):</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {r.stops?.map((s, idx) => (
                        <span key={idx} style={{
                          fontSize: '11px',
                          backgroundColor: 'var(--surface-secondary)',
                          border: '1px solid var(--border-color)',
                          padding: '2px 7px',
                          borderRadius: '4px'
                        }}>
                          {idx + 1}. {s.replace('_', ' ').toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- VIEW 7: AI TRIP PLANNER --- */}
          {activeView === 'planner' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">AI Trip Planner</h1>
                  <p className="page-subtitle">Natural-language multi-modal trip planning with transfer feasibility guarantees</p>
                </div>
              </div>

              <div className="card">
                <form onSubmit={handlePlanSubmit}>
                  <textarea 
                    className="journey-textarea"
                    rows={3}
                    placeholder="Enter your request, e.g. Help me reach Majestic by 9 AM, or I missed my connection at Silk Board..."
                    value={plannerQuery}
                    onChange={(e) => setPlannerQuery(e.target.value)}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button 
                        type="button" 
                        className="example-chip"
                        onClick={() => setPlannerQuery("Help me reach Majestic by 9 AM.")}
                      >
                        Reach Majestic by 9 AM
                      </button>
                      <button 
                        type="button" 
                        className="example-chip"
                        onClick={() => setPlannerQuery("I missed my connection at Silk Board to Electronic City.")}
                      >
                        Missed connection at Silk Board
                      </button>
                    </div>

                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={plannerLoading}
                    >
                      {plannerLoading ? 'Thinking...' : 'Plan journey'}
                    </button>
                  </div>
                </form>
              </div>

              {plannerError && (
                <div style={{ backgroundColor: '#FEE2E2', padding: '9px 12px', borderRadius: '6px', color: '#991B1B', marginBottom: '14px', fontSize: '13px' }}>
                  {plannerError}
                </div>
              )}

              {plannerResult && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>RECOMMENDED ROUTE</span>
                      <h3 style={{ fontSize: '17px' }}>{plannerResult.origin} → {plannerResult.destination}</h3>
                    </div>
                    <div>
                      <span className="badge badge-green">{plannerResult.recommended?.total_duration_mins} mins</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Engine: {plannerResult.ai_engine} • Status: {plannerResult.feasibility?.status}
                  </div>

                  <div className="timeline">
                    {plannerResult.recommended?.steps?.map((step, idx) => (
                      <div key={idx} className="timeline-step active-step">
                        <div className="step-marker">•</div>
                        <div className="step-content">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '13px' }}>{step.instruction}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{step.duration_mins || step.buffer_mins} mins</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- VIEW 8: ABOUT BOARDWISE --- */}
          {activeView === 'about' && (
            <div>
              <div className="page-title-row">
                <div>
                  <h1 className="page-title">About BoardWise AI</h1>
                  <p className="page-subtitle">Product architecture, deterministic models, and open-source foundation</p>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '15px', marginBottom: '6px' }}>Public Transport Mission</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
                  BoardWise AI addresses commuter unpredictability in Bengaluru: bus crowding uncertainty, tight transfer risks, and missed connections across multi-modal journeys.
                </p>

                <h3 style={{ fontSize: '15px', marginBottom: '6px' }}>Core Engineering Principles</h3>
                <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '16px', marginBottom: '14px' }}>
                  <li><strong>Deterministic Feasibility:</strong> Transfer buffer safety calculations are computed with verifiable rules, not AI guesses.</li>
                  <li><strong>QR Boarding & Event-Driven Counts:</strong> Unique QR codes increment passenger counts upon boarding and automatically decrement counts when buses arrive at passengers' chosen alighting stops.</li>
                  <li><strong>Ollama Open-Weight Integration:</strong> Runs private open-weight models (`llama3.2:1b`) with an automated heuristic fallback.</li>
                  <li><strong>Data Integrity:</strong> Live and simulated GPS are strictly separated; demo data is transparently labeled.</li>
                </ul>

                <h3 style={{ fontSize: '15px', marginBottom: '6px' }}>Disclaimers & Provenance</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  BoardWise AI is an independent open-source hackathon prototype. It is not an official BMTC or BMRCL government service. Occupancy figures represent estimates based on digital QR registrations.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
