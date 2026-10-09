import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from flask import Flask, request, jsonify
from flask_cors import CORS
from agent import run_agent_workflow, check_ollama_status
from tools.route_planner import load_transit_data, plan_journey, recover_missed_connection
from tools.fleet_manager import (
    get_all_buses,
    get_bus_by_id,
    resolve_qr,
    board_passenger,
    cancel_passenger_journey,
    advance_bus_stop,
    get_session_journeys,
    check_bmtc_live_api,
    init_fleet
)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route("/api/health", methods=["GET"])
def health():
    transit_data = load_transit_data()
    ollama_status = check_ollama_status()
    bmtc_info = check_bmtc_live_api()
    
    return jsonify({
        "status": "healthy",
        "service": "BoardWise AI Backend",
        "version": "2.0.0",
        "dataset": {
            "name": transit_data["dataset_info"]["name"],
            "stops_count": len(transit_data["stops"]),
            "routes_count": len(transit_data["routes"]),
            "is_demo_data": True
        },
        "fleet": {
            "total_buses": len(get_all_buses()),
            "bmtc_live_status": bmtc_info["active_mode"]
        },
        "ollama": {
            "is_reachable": ollama_status["available"],
            "installed_models": ollama_status["models"],
            "preferred_model": ollama_status["preferred_model"],
            "setup_command": "ollama run llama3.2" if not ollama_status["available"] or not ollama_status["models"] else None
        }
    })

# --- Fleet & GPS Tracking Endpoints ---

@app.route("/api/fleet", methods=["GET"])
def get_fleet():
    buses = get_all_buses()
    return jsonify({
        "status": "success",
        "buses": buses,
        "total_buses": len(buses),
        "timestamp": os.environ.get("TIMESTAMP", "")
    })

@app.route("/api/fleet/<bus_id>", methods=["GET"])
def get_single_bus(bus_id):
    bus = get_bus_by_id(bus_id)
    if not bus:
        return jsonify({"status": "error", "message": f"Bus {bus_id} not found"}), 404
    return jsonify({"status": "success", "bus": bus})

@app.route("/api/fleet/advance", methods=["POST"])
def advance_bus():
    data = request.get_json(silent=True) or {}
    bus_id = data.get("bus_id")
    if not bus_id:
        return jsonify({"status": "error", "message": "bus_id is required"}), 400
    res = advance_bus_stop(bus_id)
    return jsonify(res)

@app.route("/api/fleet/reset", methods=["POST"])
def reset_fleet():
    init_fleet()
    return jsonify({"status": "success", "message": "Fleet state reset to demo initial values", "buses": get_all_buses()})

@app.route("/api/bmtc/status", methods=["GET"])
def bmtc_status():
    status = check_bmtc_live_api()
    return jsonify({"status": "success", "bmtc": status})

# --- QR & Passenger Journey Endpoints ---

@app.route("/api/qr/list", methods=["GET"])
def qr_list():
    buses = get_all_buses()
    qr_data = []
    for b in buses:
        qr_data.append({
            "bus_id": b["bus_id"],
            "vehicle_no": b["vehicle_no"],
            "route_id": b["route_id"],
            "route_name": b["route_name"],
            "qr_code": b["qr_code"],
            "capacity": b["capacity"],
            "current_stop_name": b["current_stop_name"]
        })
    return jsonify({"status": "success", "qrs": qr_data})

@app.route("/api/qr/scan", methods=["POST"])
def scan_qr_code():
    data = request.get_json(silent=True) or {}
    qr_code = data.get("qr_code", "").strip()
    if not qr_code:
        return jsonify({"status": "error", "message": "QR code token is required"}), 400
    
    bus = resolve_qr(qr_code)
    if not bus:
        return jsonify({"status": "error", "message": f"Invalid or unrecognized QR token: '{qr_code}'"}), 404

    transit_data = load_transit_data()
    all_stops = {s["id"]: s["name"] for s in transit_data["stops"]}
    
    # Provide available downstream stops for alighting
    route_stops = bus["route_stops"]
    curr_idx = bus["current_stop_index"]
    available_alighting_stops = []
    for i, s_id in enumerate(route_stops):
        if i > curr_idx:
            available_alighting_stops.append({
                "stop_id": s_id,
                "stop_name": all_stops.get(s_id, s_id.title()),
                "stops_away": i - curr_idx
            })

    return jsonify({
        "status": "success",
        "bus": bus,
        "available_alighting_stops": available_alighting_stops
    })

@app.route("/api/journey/board", methods=["POST"])
def board():
    data = request.get_json(silent=True) or {}
    qr_code = data.get("qr_code", "").strip()
    session_id = data.get("session_id", "").strip()
    alighting_stop_id = data.get("alighting_stop_id", "").strip()

    if not qr_code or not session_id or not alighting_stop_id:
        return jsonify({
            "status": "error",
            "message": "qr_code, session_id, and alighting_stop_id are all required."
        }), 400

    res = board_passenger(qr_code, session_id, alighting_stop_id)
    code = 200 if res["status"] == "success" else 400
    return jsonify(res), code

@app.route("/api/journey/cancel", methods=["POST"])
def cancel_journey():
    data = request.get_json(silent=True) or {}
    journey_id = data.get("journey_id", "").strip()
    session_id = data.get("session_id", "").strip()

    if not journey_id or not session_id:
        return jsonify({"status": "error", "message": "journey_id and session_id are required."}), 400

    res = cancel_passenger_journey(journey_id, session_id)
    code = 200 if res["status"] == "success" else 400
    return jsonify(res), code

@app.route("/api/journey/my", methods=["GET"])
def my_journeys():
    session_id = request.args.get("session_id", "").strip()
    if not session_id:
        return jsonify({"status": "error", "message": "session_id query parameter is required"}), 400
    journeys = get_session_journeys(session_id)
    return jsonify({"status": "success", "journeys": journeys})

# --- Route & Planning Endpoints ---

@app.route("/api/stops", methods=["GET"])
def get_stops():
    try:
        transit_data = load_transit_data()
        return jsonify({
            "status": "success",
            "stops": transit_data["stops"]
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/routes", methods=["GET"])
def get_routes():
    try:
        transit_data = load_transit_data()
        return jsonify({
            "status": "success",
            "routes": transit_data["routes"]
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/plan", methods=["POST"])
def plan():
    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()
    origin = data.get("origin")
    destination = data.get("destination")
    deadline = data.get("deadline")
    walking_pref = data.get("walking_pref", "normal")
    
    if not query and (not origin or not destination):
        return jsonify({
            "status": "error",
            "message": "Please enter a journey request or select an origin and destination."
        }), 400

    try:
        if query:
            result = run_agent_workflow(query)
        else:
            result = plan_journey(
                origin_raw=origin,
                destination_raw=destination,
                deadline_str=deadline,
                walking_pref=walking_pref
            )
            result["query"] = f"From {origin} to {destination}" + (f" by {deadline}" if deadline else "")
            result["intent"] = "plan"
            result["ai_engine"] = "Direct Route Engine"
        
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error while planning route: {str(e)}"
        }), 500

@app.route("/api/recover", methods=["POST"])
def recover():
    data = request.get_json(silent=True) or {}
    current_stop = data.get("current_stop", "")
    destination = data.get("destination", "")
    missed_route_id = data.get("missed_route_id")
    current_time_str = data.get("current_time")
    
    if not current_stop or not destination:
        return jsonify({
            "status": "error",
            "message": "Both current stop and destination are required for connection recovery."
        }), 400
        
    try:
        res = recover_missed_connection(
            current_stop_raw=current_stop,
            destination_raw=destination,
            missed_route_id=missed_route_id,
            current_time_str=current_time_str
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"BoardWise AI Backend v2.0 running on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=False)
