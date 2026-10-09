import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "bengaluru_transit.json")

def load_transit_data() -> Dict[str, Any]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def normalize_stop_name(raw: str, stops: List[Dict[str, Any]]) -> Optional[str]:
    """Fuzzy match user stop input against known stops."""
    if not raw:
        return None
    raw_clean = raw.lower().strip().replace("-", " ").replace("_", " ")
    
    # Direct match on ID or Name
    for stop in stops:
        s_id = stop["id"].lower()
        s_name = stop["name"].lower()
        if raw_clean == s_id or raw_clean == s_name:
            return stop["id"]
        if raw_clean in s_name or s_id in raw_clean:
            return stop["id"]
            
    # Keywords matching
    aliases = {
        "majestic": "majestic",
        "kbs": "majestic",
        "kempegowda": "majestic",
        "central": "majestic",
        "mg road": "mg_road",
        "mg": "mg_road",
        "indiranagar": "indiranagar",
        "indira nagar": "indiranagar",
        "koramangala": "koramangala",
        "silk board": "silk_board",
        "silkboard": "silk_board",
        "electronic city": "electronic_city",
        "ecity": "electronic_city",
        "e-city": "electronic_city",
        "marathahalli": "marathahalli",
        "whitefield": "whitefield",
        "itpl": "whitefield",
        "hebbal": "hebbal",
        "yeshwantpur": "yeshwantpur",
        "banashankari": "banashankari",
        "bsk": "banashankari"
    }
    for alias, stop_id in aliases.items():
        if alias in raw_clean:
            return stop_id
    return None

def get_stop_name(stop_id: str, stops: List[Dict[str, Any]]) -> str:
    for s in stops:
        if s["id"] == stop_id:
            return s["name"]
    return stop_id.replace("_", " ").title()

def calculate_segment_time(route: Dict[str, Any], from_stop: str, to_stop: str) -> Optional[int]:
    """Calculate minutes between two stops on a route (both forward and reverse)."""
    stops = route["stops"]
    durations = route["durations_between_stops_mins"]
    
    if from_stop not in stops or to_stop not in stops:
        return None
    
    idx1 = stops.index(from_stop)
    idx2 = stops.index(to_stop)
    
    if idx1 == idx2:
        return 0
    elif idx1 < idx2:
        return sum(durations[idx1:idx2])
    else:
        # reverse direction takes equal segment times in demo model
        return sum(durations[idx2:idx1])

def parse_time_str(time_str: Optional[str]) -> datetime:
    """Parse a time string like '09:00', '9 AM', '14:30', or default to now."""
    base_date = datetime.now().replace(second=0, microsecond=0)
    if not time_str:
        return base_date
    
    clean = time_str.strip().lower()
    try:
        # try 24hr format HH:MM
        if ":" in clean and ("am" not in clean and "pm" not in clean):
            parts = clean.split(":")
            h, m = int(parts[0]), int(parts[1][:2])
            return base_date.replace(hour=h, minute=m)
        # try 12hr format
        is_pm = "pm" in clean
        is_am = "am" in clean
        digits = "".join([c for c in clean if c.isdigit() or c == ":"])
        if ":" in digits:
            h, m = map(int, digits.split(":")[:2])
        else:
            h = int(digits)
            m = 0
        if is_pm and h < 12:
            h += 12
        elif is_am and h == 12:
            h = 0
        return base_date.replace(hour=h, minute=m)
    except Exception:
        return base_date

def plan_journey(
    origin_raw: str,
    destination_raw: str,
    departure_time_str: Optional[str] = None,
    deadline_str: Optional[str] = None,
    walking_pref: str = "normal"
) -> Dict[str, Any]:
    """
    Finds direct or single-transfer routes deterministically.
    Evaluates transfer buffers and deadline feasibility.
    """
    data = load_transit_data()
    stops = data["stops"]
    routes = data["routes"]
    transfers_info = data.get("transfer_points", {})
    
    origin = normalize_stop_name(origin_raw, stops)
    destination = normalize_stop_name(destination_raw, stops)
    
    if not origin or not destination:
        return {
            "status": "error",
            "message": f"Could not resolve locations: origin='{origin_raw}', destination='{destination_raw}'. Known stops: {', '.join([s['name'] for s in stops])}",
            "known_stops": [s["name"] for s in stops]
        }
    
    if origin == destination:
        return {
            "status": "error",
            "message": f"Origin and destination are the same ({get_stop_name(origin, stops)})."
        }
        
    dep_time = parse_time_str(departure_time_str)
    deadline_time = parse_time_str(deadline_str) if deadline_str else None
    
    candidate_itineraries = []
    
    # 1. Check for Direct Routes
    for route in routes:
        if origin in route["stops"] and destination in route["stops"]:
            ride_mins = calculate_segment_time(route, origin, destination)
            if ride_mins is not None and ride_mins > 0:
                first_wait = route["headway_mins"] // 2
                walk_start = 5 if walking_pref != "minimal" else 3
                total_duration = walk_start + first_wait + ride_mins
                
                arr_time = dep_time + timedelta(minutes=total_duration)
                
                steps = [
                    {
                        "step_number": 1,
                        "type": "walk",
                        "instruction": f"Walk to {get_stop_name(origin, stops)}",
                        "from_stop": "Origin",
                        "to_stop": get_stop_name(origin, stops),
                        "duration_mins": walk_start,
                        "distance_meters": 300
                    },
                    {
                        "step_number": 2,
                        "type": route["mode"],
                        "route_id": route["id"],
                        "route_name": route["name"],
                        "operator": route["operator"],
                        "instruction": f"Board {route['name']} towards {get_stop_name(destination, stops)}",
                        "from_stop": get_stop_name(origin, stops),
                        "to_stop": get_stop_name(destination, stops),
                        "duration_mins": ride_mins,
                        "frequency_mins": route["headway_mins"],
                        "expected_wait_mins": first_wait
                    }
                ]
                
                candidate_itineraries.append({
                    "type": "direct",
                    "route_summary": f"Direct via {route['name']}",
                    "total_duration_mins": total_duration,
                    "departure_time": dep_time.strftime("%H:%M"),
                    "arrival_time": arr_time.strftime("%H:%M"),
                    "arrival_datetime": arr_time,
                    "num_transfers": 0,
                    "transfer_points": [],
                    "steps": steps,
                    "walking_mins": walk_start,
                    "transit_mins": ride_mins,
                    "primary_mode": route["mode"]
                })
                
    # 2. Check for 1-Transfer Routes
    for route1 in routes:
        if origin not in route1["stops"]:
            continue
        for route2 in routes:
            if route1["id"] == route2["id"] or destination not in route2["stops"]:
                continue
                
            # Find intermediate interchange stop common to both
            common_stops = [s for s in route1["stops"] if s in route2["stops"] and s != origin and s != destination]
            for transfer_stop in common_stops:
                leg1_mins = calculate_segment_time(route1, origin, transfer_stop)
                leg2_mins = calculate_segment_time(route2, transfer_stop, destination)
                
                if leg1_mins is None or leg2_mins is None or leg1_mins <= 0 or leg2_mins <= 0:
                    continue
                    
                t_info = transfers_info.get(transfer_stop, {
                    "min_transfer_buffer_mins": 6,
                    "walk_distance_meters": 200,
                    "avg_wait_mins": route2["headway_mins"] // 2
                })
                
                walk_start = 5
                leg1_wait = route1["headway_mins"] // 2
                transfer_walk = t_info.get("min_transfer_buffer_mins", 6)
                leg2_wait = t_info.get("avg_wait_mins", route2["headway_mins"] // 2)
                
                total_duration = walk_start + leg1_wait + leg1_mins + transfer_walk + leg2_wait + leg2_mins
                arr_time = dep_time + timedelta(minutes=total_duration)
                
                steps = [
                    {
                        "step_number": 1,
                        "type": "walk",
                        "instruction": f"Walk to {get_stop_name(origin, stops)}",
                        "from_stop": "Origin",
                        "to_stop": get_stop_name(origin, stops),
                        "duration_mins": walk_start,
                        "distance_meters": 300
                    },
                    {
                        "step_number": 2,
                        "type": route1["mode"],
                        "route_id": route1["id"],
                        "route_name": route1["name"],
                        "operator": route1["operator"],
                        "instruction": f"Board {route1['name']} to {get_stop_name(transfer_stop, stops)}",
                        "from_stop": get_stop_name(origin, stops),
                        "to_stop": get_stop_name(transfer_stop, stops),
                        "duration_mins": leg1_mins,
                        "frequency_mins": route1["headway_mins"],
                        "expected_wait_mins": leg1_wait
                    },
                    {
                        "step_number": 3,
                        "type": "transfer",
                        "transfer_stop": get_stop_name(transfer_stop, stops),
                        "instruction": f"Transfer at {get_stop_name(transfer_stop, stops)} (Platform interchange)",
                        "buffer_mins": transfer_walk,
                        "distance_meters": t_info.get("walk_distance_meters", 180),
                        "connection_risk": "tight" if transfer_walk < 4 else "safe"
                    },
                    {
                        "step_number": 4,
                        "type": route2["mode"],
                        "route_id": route2["id"],
                        "route_name": route2["name"],
                        "operator": route2["operator"],
                        "instruction": f"Board {route2['name']} from {get_stop_name(transfer_stop, stops)} to {get_stop_name(destination, stops)}",
                        "from_stop": get_stop_name(transfer_stop, stops),
                        "to_stop": get_stop_name(destination, stops),
                        "duration_mins": leg2_mins,
                        "frequency_mins": route2["headway_mins"],
                        "expected_wait_mins": leg2_wait
                    }
                ]
                
                candidate_itineraries.append({
                    "type": "connecting",
                    "route_summary": f"Via {get_stop_name(transfer_stop, stops)} ({route1['name']} → {route2['name']})",
                    "total_duration_mins": total_duration,
                    "departure_time": dep_time.strftime("%H:%M"),
                    "arrival_time": arr_time.strftime("%H:%M"),
                    "arrival_datetime": arr_time,
                    "num_transfers": 1,
                    "transfer_points": [get_stop_name(transfer_stop, stops)],
                    "steps": steps,
                    "walking_mins": walk_start + transfer_walk,
                    "transit_mins": leg1_mins + leg2_mins,
                    "primary_mode": "mixed"
                })

    if not candidate_itineraries:
        return {
            "status": "not_found",
            "message": f"No scheduled connection found between {get_stop_name(origin, stops)} and {get_stop_name(destination, stops)} in the demo network.",
            "data_source": "Bengaluru Sample Transit Network (Demo)",
            "origin": get_stop_name(origin, stops),
            "destination": get_stop_name(destination, stops)
        }

    # Sort itineraries: direct first, then least total duration, then less walking if requested
    if walking_pref == "minimal":
        candidate_itineraries.sort(key=lambda x: (x["num_transfers"], x["walking_mins"], x["total_duration_mins"]))
    else:
        candidate_itineraries.sort(key=lambda x: (x["num_transfers"], x["total_duration_mins"]))

    recommended = candidate_itineraries[0]
    alternatives = candidate_itineraries[1:4]

    # Evaluate Deadline Feasibility
    feasibility = {
        "status": "feasible",
        "deadline": deadline_str if deadline_str else "Not specified",
        "margin_mins": None,
        "detail": "Journey fits regular scheduled frequency without deadline constraint."
    }
    
    if deadline_time:
        arr = recommended["arrival_datetime"]
        diff_mins = int((deadline_time - arr).total_seconds() / 60)
        feasibility["margin_mins"] = diff_mins
        if diff_mins >= 10:
            feasibility["status"] = "feasible_comfortable"
            feasibility["detail"] = f"Arrives {diff_mins} minutes ahead of your {deadline_str} deadline."
        elif diff_mins >= 0:
            feasibility["status"] = "feasible_tight"
            feasibility["detail"] = f"Arrives with only {diff_mins} min buffer before {deadline_str}. Little room for traffic delay."
        else:
            feasibility["status"] = "infeasible"
            feasibility["detail"] = f"Estimated arrival ({recommended['arrival_time']}) misses your {deadline_str} deadline by {abs(diff_mins)} minutes. An earlier departure is required."

    # Reasons for recommendation
    reasons = []
    if recommended["num_transfers"] == 0:
        reasons.append(f"Direct journey with zero transfers saves transit friction.")
    else:
        reasons.append(f"Fastest multi-leg connection via {recommended['transfer_points'][0]} interchange.")
    reasons.append(f"Total estimated travel time is ~{recommended['total_duration_mins']} mins.")
    if walking_pref == "minimal":
        reasons.append(f"Optimized for minimal walking ({recommended['walking_mins']} mins on foot).")

    # Clean datetime objects for JSON serialization
    for item in [recommended] + alternatives:
        if "arrival_datetime" in item:
            del item["arrival_datetime"]

    return {
        "status": "success",
        "origin": get_stop_name(origin, stops),
        "destination": get_stop_name(destination, stops),
        "origin_id": origin,
        "destination_id": destination,
        "recommended": recommended,
        "alternatives": alternatives,
        "feasibility": feasibility,
        "reasons": reasons,
        "data_provenance": {
            "source": "Bengaluru Sample Transit Network (Demo)",
            "is_demo_data": True,
            "verification_type": "Deterministic schedule simulation (Non-live)",
            "traffic_factor_applied": "Baseline scheduled time"
        }
    }

def recover_missed_connection(
    current_stop_raw: str,
    destination_raw: str,
    missed_route_id: Optional[str] = None,
    current_time_str: Optional[str] = None
) -> Dict[str, Any]:
    """
    Recovers from a missed bus or missed transfer at a given location.
    Determines next available departure or alternative routing.
    """
    data = load_transit_data()
    stops = data["stops"]
    routes = data["routes"]
    
    current_stop = normalize_stop_name(current_stop_raw, stops)
    destination = normalize_stop_name(destination_raw, stops)
    
    if not current_stop or not destination:
        return {
            "status": "error",
            "message": f"Cannot identify current stop '{current_stop_raw}' or destination '{destination_raw}'."
        }
        
    curr_time = parse_time_str(current_time_str)
    
    # Check routes passing through current stop to destination
    options = []
    
    # 1. Next bus on the same route if known
    if missed_route_id:
        target_route = next((r for r in routes if r["id"].lower() == missed_route_id.lower()), None)
        if target_route and current_stop in target_route["stops"] and destination in target_route["stops"]:
            ride_mins = calculate_segment_time(target_route, current_stop, destination)
            next_bus_wait = target_route["headway_mins"]
            total_mins = next_bus_wait + ride_mins
            arr_time = curr_time + timedelta(minutes=total_mins)
            
            options.append({
                "type": "same_route_next_service",
                "route_name": target_route["name"],
                "strategy": f"Wait for next {target_route['name']} service (headway: {next_bus_wait} mins)",
                "wait_mins": next_bus_wait,
                "ride_mins": ride_mins,
                "total_mins": total_mins,
                "arrival_time": arr_time.strftime("%H:%M"),
                "notes": f"Scheduled wait of ~{next_bus_wait} minutes. No platform transfer needed."
            })
            
    # 2. Parallel or alternative routes from current stop
    plan = plan_journey(current_stop, destination, departure_time_str=current_time_str)
    
    return {
        "status": "success",
        "current_stop": get_stop_name(current_stop, stops),
        "destination": get_stop_name(destination, stops),
        "missed_service": missed_route_id or "Previous Connection",
        "recovery_plan": plan.get("recommended"),
        "alternative_recovery_options": plan.get("alternatives", []),
        "explanation": f"Connection missed at {get_stop_name(current_stop, stops)}. Re-routed from current platform directly to {get_stop_name(destination, stops)}.",
        "feasibility": plan.get("feasibility"),
        "data_provenance": {
            "source": "Bengaluru Sample Transit Network (Demo)",
            "is_demo_data": True,
            "verification_type": "Deterministic recovery lookup"
        }
    }
