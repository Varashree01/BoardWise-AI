import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tools.fleet_manager import (
    init_fleet,
    get_all_buses,
    get_bus_by_id,
    resolve_qr,
    board_passenger,
    cancel_passenger_journey,
    advance_bus_stop,
    get_occupancy_status
)

class TestFleetManager(unittest.TestCase):
    def setUp(self):
        init_fleet()

    def test_fleet_initialized(self):
        buses = get_all_buses()
        self.assertGreaterEqual(len(buses), 4)
        for b in buses:
            self.assertIn("qr_code", b)
            self.assertIn("capacity", b)
            self.assertIn("estimated_occupancy", b)

    def test_qr_resolution(self):
        bus = resolve_qr("BW-QR-335E-4521-X9")
        self.assertIsNotNone(bus)
        self.assertEqual(bus["bus_id"], "KA-01-F-4521")
        self.assertEqual(bus["route_id"], "335E")

        invalid = resolve_qr("INVALID-TOKEN-99")
        self.assertIsNone(invalid)

    def test_boarding_and_occupancy_increment(self):
        bus_before = get_bus_by_id("KA-01-F-4521")
        init_occ = bus_before["estimated_occupancy"]

        res = board_passenger(
            qr_code="BW-QR-335E-4521-X9",
            session_id="user_session_alpha",
            alighting_stop_id="whitefield"
        )
        self.assertEqual(res["status"], "success")
        self.assertIn("journey", res)

        bus_after = get_bus_by_id("KA-01-F-4521")
        self.assertEqual(bus_after["estimated_occupancy"], init_occ + 1)

    def test_prevent_duplicate_active_journey(self):
        board_passenger(
            qr_code="BW-QR-335E-4521-X9",
            session_id="user_session_beta",
            alighting_stop_id="whitefield"
        )
        # Attempt duplicate scan by same session on same bus
        duplicate_res = board_passenger(
            qr_code="BW-QR-335E-4521-X9",
            session_id="user_session_beta",
            alighting_stop_id="marathahalli"
        )
        self.assertEqual(duplicate_res["status"], "error")
        self.assertIn("already have an active journey", duplicate_res["message"])

    def test_automatic_alighting_decrements_occupancy(self):
        # Bus 335E starts at stop 0: majestic
        # Route stops: majestic, mg_road, indiranagar, marathahalli, whitefield
        res = board_passenger(
            qr_code="BW-QR-335E-4521-X9",
            session_id="user_session_gamma",
            alighting_stop_id="mg_road"  # Stop 1
        )
        self.assertEqual(res["status"], "success")
        bus = get_bus_by_id("KA-01-F-4521")
        occ_after_board = bus["estimated_occupancy"]

        # Advance bus from stop 0 to stop 1 (mg_road)
        advance_res = advance_bus_stop("KA-01-F-4521")
        self.assertEqual(advance_res["status"], "success")
        self.assertEqual(advance_res["alighted_count"], 1)

        bus_after_alight = get_bus_by_id("KA-01-F-4521")
        self.assertEqual(bus_after_alight["estimated_occupancy"], occ_after_board - 1)

        # Idempotency check: advancing again does NOT decrement again
        advance_again = advance_bus_stop("KA-01-F-4521")
        self.assertEqual(advance_again["alighted_count"], 0)

    def test_cancel_journey_early_exit(self):
        board_res = board_passenger(
            qr_code="BW-QR-356C-1982-K3",
            session_id="user_session_delta",
            alighting_stop_id="electronic_city"
        )
        j_id = board_res["journey"]["journey_id"]
        bus_boarded = get_bus_by_id("KA-01-FA-1982")
        occ_after_board = bus_boarded["estimated_occupancy"]

        cancel_res = cancel_passenger_journey(j_id, "user_session_delta")
        self.assertEqual(cancel_res["status"], "success")

        bus_after_cancel = get_bus_by_id("KA-01-FA-1982")
        self.assertEqual(bus_after_cancel["estimated_occupancy"], occ_after_board - 1)

if __name__ == "__main__":
    unittest.main()
