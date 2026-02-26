import express from "express";
import { fullAutomation } from "../controllers/automationController.js";

const router = express.Router();

router.post("/start", fullAutomation);

export default router;
