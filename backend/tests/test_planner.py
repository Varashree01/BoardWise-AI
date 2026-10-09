import os
import sys
import unittest

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tools.route_planner import plan_journey, recover_missed_connection, normalize_stop_name, load_transit_data
from agent import heuristic_parse_query, run_agent_workflow

class TestBoardWiseTransit(unittest.TestCase):
    def setUp(self):
        self.data = load_transit_data()

    def test_dataset_loaded(self):
        self.assertGreater(len(self.data["stops"]), 5)
        self.assertGreater(len(self.data["routes"]), 3)

    def test_direct_route_planning(self):
        result = plan_journey("indiranagar", "whitefield")
        self.assertEqual(result["status"], "success")
        self.assertIn("recommended", result)
        rec = result["recommended"]
        self.assertEqual(rec["num_transfers"], 0)
        self.assertGreater(rec["total_duration_mins"], 0)

    def test_connecting_route_planning(self):
        # Indiranagar to Electronic city requires transfer at Silk Board
        result = plan_journey("indiranagar", "electronic_city")
        self.assertEqual(result["status"], "success")
        rec = result["recommended"]
        self.assertGreaterEqual(rec["num_transfers"], 1)
        self.assertIn("Silk Board Junction", rec["transfer_points"])

    def test_deadline_feasibility(self):
        # Target with comfortable deadline
        res_comfortable = plan_journey("indiranagar", "majestic", deadline_str="12:00 PM")
        self.assertEqual(res_comfortable["status"], "success")
        self.assertIn("feasibility", res_comfortable)

    def test_missed_connection_recovery(self):
        rec = recover_missed_connection(
            current_stop_raw="silk_board",
            destination_raw="electronic_city",
            missed_route_id="356C"
        )
        self.assertEqual(rec["status"], "success")
        self.assertIn("Silk Board Junction", rec["current_stop"])
        self.assertIsNotNone(rec.get("recovery_plan"))

    def test_heuristic_query_parsing(self):
        q1 = "Help me reach Majestic by 9 AM"
        parsed1 = heuristic_parse_query(q1, self.data["stops"])
        self.assertEqual(parsed1["destination"], "majestic")
        self.assertIsNotNone(parsed1["deadline"])

        q2 = "I missed my connection at Silk Board to Electronic City"
        parsed2 = heuristic_parse_query(q2, self.data["stops"])
        self.assertEqual(parsed2["intent"], "recover")
        self.assertEqual(parsed2["origin"], "silk_board")
        self.assertEqual(parsed2["destination"], "electronic_city")

    def test_run_agent_workflow(self):
        res = run_agent_workflow("Help me reach Majestic by 9 AM")
        self.assertEqual(res["status"], "success")
        self.assertIn("recommended", res)
        self.assertTrue(res["data_provenance"]["is_demo_data"])

if __name__ == "__main__":
    unittest.main()
