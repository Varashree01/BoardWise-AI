// In-browser transit state and simulation engine
// Provides 100% full offline & Vercel serverless resilience

export const DEFAULT_TRANSIT_DATA = {
  stops: [
    { id: "majestic", name: "Majestic (KBS)", type: "interchange", lat: 12.9767, lon: 77.5713 },
    { id: "mg_road", name: "MG Road", type: "metro_bus", lat: 12.9756, lon: 77.6066 },
    { id: "indiranagar", name: "Indiranagar", type: "metro_bus", lat: 12.9784, lon: 77.6408 },
    { id: "koramangala", name: "Koramangala", type: "bus_hub", lat: 12.9352, lon: 77.6245 },
    { id: "silk_board", name: "Silk Board Junction", type: "major_interchange", lat: 12.9176, lon: 77.6238 },
    { id: "electronic_city", name: "Electronic City Toll", type: "bus_terminal", lat: 12.8399, lon: 77.6770 },
    { id: "marathahalli", name: "Marathahalli Bridge", type: "interchange", lat: 12.9591, lon: 77.6974 },
    { id: "whitefield", name: "Whitefield (ITPL)", type: "metro_bus", lat: 12.9855, lon: 77.7314 },
    { id: "hebbal", name: "Hebbal Flyover", type: "bus_hub", lat: 13.0358, lon: 77.5970 },
    { id: "yeshwantpur", name: "Yeshwantpur TTMC", type: "interchange", lat: 13.0223, lon: 77.5503 },
    { id: "banashankari", name: "Banashankari TTMC", type: "interchange", lat: 12.9156, lon: 77.5736 }
  ],
  routes: [
    {
      id: "335E",
      name: "Route 335-E (Volvo AC)",
      mode: "bus",
      operator: "BMTC Demo",
      headway_mins: 12,
      stops: ["majestic", "mg_road", "indiranagar", "marathahalli", "whitefield"],
      durations_between_stops_mins: [15, 12, 22, 20]
    },
    {
      id: "METRO_PURPLE",
      name: "Purple Line Metro",
      mode: "metro",
      operator: "BMRCL Demo",
      headway_mins: 6,
      stops: ["majestic", "mg_road", "indiranagar", "whitefield"],
      durations_between_stops_mins: [8, 10, 24]
    },
    {
      id: "356C",
      name: "Route 356-C",
      mode: "bus",
      operator: "BMTC Demo",
      headway_mins: 10,
      stops: ["majestic", "koramangala", "silk_board", "electronic_city"],
      durations_between_stops_mins: [22, 14, 25]
    },
    {
      id: "500D",
      name: "Route 500-D (Ring Road Express)",
      mode: "bus",
      operator: "BMTC Demo",
      headway_mins: 8,
      stops: ["hebbal", "marathahalli", "silk_board", "banashankari"],
      durations_between_stops_mins: [28, 22, 18]
    },
    {
      id: "G2",
      name: "Route G-2 (Radial)",
      mode: "bus",
      operator: "BMTC Demo",
      headway_mins: 15,
      stops: ["indiranagar", "koramangala", "silk_board"],
      durations_between_stops_mins: [18, 12]
    }
  ]
};

export const INITIAL_BUSES = [
  {
    bus_id: "KA-01-F-4521",
    vehicle_no: "KA-01-F-4521",
    route_id: "335E",
    route_name: "Route 335-E (Volvo AC)",
    qr_code: "BW-QR-335E-4521-X9",
    capacity: 45,
    current_stop_index: 0,
    current_stop_id: "majestic",
    current_stop_name: "Majestic (KBS)",
    lat: 12.9767,
    lon: 77.5713,
    direction: "UP",
    speed_kmh: 28,
    estimated_occupancy: 22,
    route_stops: ["majestic", "mg_road", "indiranagar", "marathahalli", "whitefield"],
    last_gps_update: "Just now"
  },
  {
    bus_id: "KA-01-FA-1982",
    vehicle_no: "KA-01-FA-1982",
    route_id: "356C",
    route_name: "Route 356-C",
    qr_code: "BW-QR-356C-1982-K3",
    capacity: 50,
    current_stop_index: 1,
    current_stop_id: "koramangala",
    current_stop_name: "Koramangala",
    lat: 12.9352,
    lon: 77.6245,
    direction: "UP",
    speed_kmh: 24,
    estimated_occupancy: 36,
    route_stops: ["majestic", "koramangala", "silk_board", "electronic_city"],
    last_gps_update: "Just now"
  },
  {
    bus_id: "KA-01-G-7712",
    vehicle_no: "KA-01-G-7712",
    route_id: "500D",
    route_name: "Route 500-D (Ring Road Express)",
    qr_code: "BW-QR-500D-7712-R7",
    capacity: 55,
    current_stop_index: 1,
    current_stop_id: "marathahalli",
    current_stop_name: "Marathahalli Bridge",
    lat: 12.9591,
    lon: 77.6974,
    direction: "UP",
    speed_kmh: 32,
    estimated_occupancy: 46,
    route_stops: ["hebbal", "marathahalli", "silk_board", "banashankari"],
    last_gps_update: "Just now"
  },
  {
    bus_id: "KA-01-F-8890",
    vehicle_no: "KA-01-F-8890",
    route_id: "G2",
    route_name: "Route G-2 (Radial)",
    qr_code: "BW-QR-G2-8890-M4",
    capacity: 40,
    current_stop_index: 0,
    current_stop_id: "indiranagar",
    current_stop_name: "Indiranagar",
    lat: 12.9784,
    lon: 77.6408,
    direction: "UP",
    speed_kmh: 20,
    estimated_occupancy: 14,
    route_stops: ["indiranagar", "koramangala", "silk_board"],
    last_gps_update: "Just now"
  }
];

export function computeOccupancyStatus(occupancy, capacity) {
  const pct = capacity > 0 ? Math.round((occupancy / capacity) * 100) : 0;
  if (pct < 50) {
    return { label: "Space likely available", color: "green", pct };
  } else if (pct <= 85) {
    return { label: "Limited space", color: "amber", pct };
  } else {
    return { label: "At capacity", color: "red", pct };
  }
}

export function enrichBus(bus) {
  const status = computeOccupancyStatus(bus.estimated_occupancy, bus.capacity);
  return {
    ...bus,
    occupancy_status: status,
    available_capacity: Math.max(0, bus.capacity - bus.estimated_occupancy)
  };
}
