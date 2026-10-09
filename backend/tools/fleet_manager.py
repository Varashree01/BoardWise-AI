import json
import os
import uuid
import time
import requests
from datetime import datetime
from typing import Dict, List, Optional, Any

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "bengaluru_transit.json")

# In-memory fleet state initialized from transit data
_fleet_state: Dict[str, Any] = {}
_active_journeys: Dict[str, Dict[str, Any]] = {}
_bmtc_cache: Dict[str, Any] = {"last_check": 0, "status": "unverified", "error": None}

def load_transit_data() -> Dict[str, Any]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def get_stop_coords(stop_id: str, stops: List[Dict[str, Any]]) -> Dict[str, float]:
    for s in stops:
        if s["id"] == stop_id:
            return {"lat": s.get("lat", 12.9716), "lon": s.get("lon", 77.5946), "name": s.get("name", stop_id)}
    return {"lat": 12.9716, "lon": 77.5946, "name": stop_id}

def init_fleet():
    global _fleet_state, _active_journeys
    data = load_transit_data()
    stops = data["stops"]
    routes = {r["id"]: r for r in data["routes"]}

    # Define demo buses
    demo_buses = [
        {
            "bus_id": "KA-01-F-4521",
            "vehicle_no": "KA-01-F-4521",
            "route_id": "335E",
            "route_name": "Route 335-E (Volvo AC)",
            "qr_code": "BW-QR-335E-4521-X9",
            "capacity": 45,
            "current_stop_index": 0,
            "direction": "UP",
            "speed_kmh": 28,
            "initial_passengers": 18
        },
        {
            "bus_id": "KA-01-FA-1982",
            "vehicle_no": "KA-01-FA-1982",
            "route_id": "356C",
            "route_name": "Route 356-C",
            "qr_code": "BW-QR-356C-1982-K3",
            "capacity": 50,
            "current_stop_index": 1,
            "direction": "UP",
            "speed_kmh": 22,
            "initial_passengers": 34
        },
        {
            "bus_id": "KA-01-G-7712",
            "vehicle_no": "KA-01-G-7712",
            "route_id": "500D",
            "route_name": "Route 500-D (Ring Road Express)",
            "qr_code": "BW-QR-500D-7712-R7",
            "capacity": 55,
            "current_stop_index": 1,
            "direction": "UP",
            "speed_kmh": 35,
            "initial_passengers": 44
        },
        {
            "bus_id": "KA-01-F-8890",
            "vehicle_no": "KA-01-F-8890",
            "route_id": "G2",
            "route_name": "Route G-2 (Radial)",
            "qr_code": "BW-QR-G2-8890-M4",
            "capacity": 40,
            "current_stop_index": 0,
            "direction": "UP",
            "speed_kmh": 20,
            "initial_passengers": 12
        }
    ]

    _fleet_state = {}
    _active_journeys = {}

    for b in demo_buses:
        route = routes.get(b["route_id"], {})
        route_stops = route.get("stops", [])
        stop_id = route_stops[b["current_stop_index"]] if route_stops else "majestic"
        coords = get_stop_coords(stop_id, stops)

        _fleet_state[b["bus_id"]] = {
            "bus_id": b["bus_id"],
            "vehicle_no": b["vehicle_no"],
            "route_id": b["route_id"],
            "route_name": b["route_name"],
            "qr_code": b["qr_code"],
            "capacity": b["capacity"],
            "route_stops": route_stops,
            "current_stop_index": b["current_stop_index"],
            "current_stop_id": stop_id,
            "current_stop_name": coords["name"],
            "lat": coords["lat"],
            "lon": coords["lon"],
            "direction": b["direction"],
            "speed_kmh": b["speed_kmh"],
            "estimated_occupancy": b["initial_passengers"],
            "active_journey_ids": [],
            "gps_mode": "simulation",  # 'live' or 'simulation'
            "last_gps_update": datetime.now().strftime("%H:%M:%S"),
            "last_occupancy_update": datetime.now().strftime("%H:%M:%S")
        }

# Initialize on module import
init_fleet()

def get_occupancy_status(occupancy: int, capacity: int) -> Dict[str, Any]:
    """Calculates deterministic occupancy tier."""
    if capacity <= 0:
        return {"label": "Occupancy unknown", "color": "neutral", "pct": 0}
    pct = round((occupancy / capacity) * 100)
    if pct < 50:
        return {"label": "Space likely available", "tier": "low", "color": "green", "pct": pct}
    elif pct <= 85:
        return {"label": "Limited space", "tier": "moderate", "color": "amber", "pct": pct}
    else:
        return {"label": "At capacity or potentially overcrowded", "tier": "high", "color": "red", "pct": pct}

def get_all_buses() -> List[Dict[str, Any]]:
    buses = []
    for b in _fleet_state.values():
        status = get_occupancy_status(b["estimated_occupancy"], b["capacity"])
        bus_copy = dict(b)
        bus_copy["occupancy_status"] = status
        bus_copy["available_capacity"] = max(0, b["capacity"] - b["estimated_occupancy"])
        buses.append(bus_copy)
    return buses

def get_bus_by_id(bus_id: str) -> Optional[Dict[str, Any]]:
    b = _fleet_state.get(bus_id)
    if not b:
        return None
    bus_copy = dict(b)
    bus_copy["occupancy_status"] = get_occupancy_status(b["estimated_occupancy"], b["capacity"])
    bus_copy["available_capacity"] = max(0, b["capacity"] - b["estimated_occupancy"])
    return bus_copy

def resolve_qr(qr_code: str) -> Optional[Dict[str, Any]]:
    """Look up bus by unique QR token."""
    for b in _fleet_state.values():
        if b["qr_code"].strip().upper() == qr_code.strip().upper():
            return get_bus_by_id(b["bus_id"])
    return None

def board_passenger(qr_code: str, session_id: str, alighting_stop_id: str) -> Dict[str, Any]:
    """
    Boards a passenger onto the bus resolved from QR:
    1. Validates QR
    2. Prevents duplicate active journeys for the same session on this bus
    3. Validates intended alighting stop is downstream in route sequence
    4. Increments onboard count
    """
    bus = resolve_qr(qr_code)
    if not bus:
        return {"status": "error", "message": "Invalid or unrecognized Bus QR code."}

    bus_id = bus["bus_id"]
    route_stops = bus["route_stops"]
    curr_idx = bus["current_stop_index"]

    # Check for existing active journey for this session on this bus
    for j in _active_journeys.values():
        if j["session_id"] == session_id and j["bus_id"] == bus_id and j["status"] == "active":
            return {
                "status": "error",
                "message": f"You already have an active journey on bus {bus['vehicle_no']}.",
                "existing_journey": j
            }

    if alighting_stop_id not in route_stops:
        return {"status": "error", "message": f"Selected stop '{alighting_stop_id}' is not served by this route."}

    alight_idx = route_stops.index(alighting_stop_id)
    if alight_idx <= curr_idx:
        return {
            "status": "error",
            "message": f"Selected stop is at or behind the bus's current location ({bus['current_stop_name']}). Please select a forward destination."
        }

    journey_id = f"JNY-{uuid.uuid4().hex[:8].upper()}"
    now_str = datetime.now().strftime("%H:%M:%S")

    transit_data = load_transit_data()
    stops = transit_data["stops"]
    alight_coords = get_stop_coords(alighting_stop_id, stops)

    journey = {
        "journey_id": journey_id,
        "session_id": session_id,
        "bus_id": bus_id,
        "vehicle_no": bus["vehicle_no"],
        "route_id": bus["route_id"],
        "route_name": bus["route_name"],
        "boarding_stop_id": bus["current_stop_id"],
        "boarding_stop_name": bus["current_stop_name"],
        "alighting_stop_id": alighting_stop_id,
        "alighting_stop_name": alight_coords["name"],
        "boarded_at": now_str,
        "status": "active",
        "alighted_at": None
    }

    _active_journeys[journey_id] = journey
    _fleet_state[bus_id]["active_journey_ids"].append(journey_id)
    # Increment estimated occupancy once
    _fleet_state[bus_id]["estimated_occupancy"] += 1
    _fleet_state[bus_id]["last_occupancy_update"] = now_str

    return {
        "status": "success",
        "journey": journey,
        "bus": get_bus_by_id(bus_id),
        "message": f"Boarding confirmed on {bus['vehicle_no']}. Your alighting stop: {alight_coords['name']}."
    }

def cancel_passenger_journey(journey_id: str, session_id: str) -> Dict[str, Any]:
    """Allows passenger to cancel or exit early, decrementing occupancy."""
    journey = _active_journeys.get(journey_id)
    if not journey:
        return {"status": "error", "message": "Journey not found."}

    if journey["session_id"] != session_id:
        return {"status": "error", "message": "Unauthorized journey modification."}

    if journey["status"] != "active":
        return {"status": "error", "message": f"Journey is already {journey['status']}."}

    bus_id = journey["bus_id"]
    journey["status"] = "cancelled"
    journey["cancelled_at"] = datetime.now().strftime("%H:%M:%S")

    if bus_id in _fleet_state:
        if journey_id in _fleet_state[bus_id]["active_journey_ids"]:
            _fleet_state[bus_id]["active_journey_ids"].remove(journey_id)
        _fleet_state[bus_id]["estimated_occupancy"] = max(0, _fleet_state[bus_id]["estimated_occupancy"] - 1)
        _fleet_state[bus_id]["last_occupancy_update"] = datetime.now().strftime("%H:%M:%S")

    return {
        "status": "success",
        "message": "Journey cancelled. Occupancy count updated.",
        "journey": journey,
        "bus": get_bus_by_id(bus_id)
    }

def advance_bus_stop(bus_id: str) -> Dict[str, Any]:
    """
    Simulation Control: Advances a bus to its next route stop.
    Evaluates all active journeys: when a bus reaches/passes a journey's alighting stop,
    completes the journey and decrements occupancy once (idempotent).
    """
    bus = _fleet_state.get(bus_id)
    if not bus:
        return {"status": "error", "message": f"Bus {bus_id} not found."}

    route_stops = bus["route_stops"]
    curr_idx = bus["current_stop_index"]

    # Next stop in sequence
    next_idx = (curr_idx + 1) % len(route_stops)
    next_stop_id = route_stops[next_idx]

    transit_data = load_transit_data()
    stops = transit_data["stops"]
    coords = get_stop_coords(next_stop_id, stops)

    bus["current_stop_index"] = next_idx
    bus["current_stop_id"] = next_stop_id
    bus["current_stop_name"] = coords["name"]
    bus["lat"] = coords["lat"]
    bus["lon"] = coords["lon"]
    now_str = datetime.now().strftime("%H:%M:%S")
    bus["last_gps_update"] = now_str

    # Process Automatic Alighting for passengers onboard this bus
    alighted_journeys = []
    active_ids = list(bus["active_journey_ids"])

    for j_id in active_ids:
        journey = _active_journeys.get(j_id)
        if not journey or journey["status"] != "active":
            continue

        # If bus reached this passenger's alighting stop
        if journey["alighting_stop_id"] == next_stop_id:
            journey["status"] = "completed"
            journey["alighted_at"] = now_str
            bus["active_journey_ids"].remove(j_id)
            # Decrement occupancy once
            bus["estimated_occupancy"] = max(0, bus["estimated_occupancy"] - 1)
            bus["last_occupancy_update"] = now_str
            alighted_journeys.append(journey)

    return {
        "status": "success",
        "bus": get_bus_by_id(bus_id),
        "alighted_count": len(alighted_journeys),
        "alighted_journeys": alighted_journeys,
        "message": f"{bus['vehicle_no']} reached {coords['name']}. {len(alighted_journeys)} passenger(s) alighted."
    }

def get_session_journeys(session_id: str) -> List[Dict[str, Any]]:
    return [j for j in _active_journeys.values() if j.get("session_id") == session_id]

def check_bmtc_live_api() -> Dict[str, Any]:
    """
    Inspects unofficial BMTC API availability.
    Implements sensible caching and returns verified status without inventing live data.
    """
    global _bmtc_cache
    now = time.time()
    # Cache for 60 seconds
    if now - _bmtc_cache["last_check"] < 60 and _bmtc_cache["status"] != "unverified":
        return _bmtc_cache

    endpoints = [
        ("https://bmtcmobapi.karnataka.gov.in/api/SearchByRouteDetails_v4", "BMTC Official Mobile Gateway"),
        ("https://bmtcmobapi.karnataka.gov.in/api/ListVehicles", "BMTC Vehicle List API")
    ]

    result = {
        "is_live_available": False,
        "endpoints_tested": [],
        "last_checked": datetime.now().strftime("%H:%M:%S"),
        "active_mode": "Deterministic Simulation Fallback",
        "disclaimer": "Live BMTC API endpoints are restricted or unresponsive without internal mobile bearer tokens. Operating in verified simulation mode with real Bengaluru route coordinates."
    }

    for url, desc in endpoints:
        try:
            r = requests.get(url, timeout=3.0, verify=False)
            result["endpoints_tested"].append({
                "name": desc,
                "url": url,
                "status_code": r.status_code,
                "reachable": r.status_code == 200
            })
            if r.status_code == 200:
                result["is_live_available"] = True
                result["active_mode"] = "Live BMTC Gateway"
        except Exception as e:
            result["endpoints_tested"].append({
                "name": desc,
                "url": url,
                "status_code": None,
                "reachable": False,
                "error": type(e).__name__
            })

    _bmtc_cache = result
    _bmtc_cache["last_check"] = now
    return result
