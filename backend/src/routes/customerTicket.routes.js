
import { Router } from "express";
import {
  createCustomerTicket,
  getMyTickets,
} from "../controllers/customerTicket.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// Both endpoints require authentication.
// Only customers can create tickets or view their own ticket history.
router.post("/", requireAuth, requireRole("customer"), createCustomerTicket);
router.get("/my", requireAuth, requireRole("customer"), getMyTickets);

export default router;
