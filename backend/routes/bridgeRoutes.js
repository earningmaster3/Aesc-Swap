import express from "express";
import { runBridgeSingle } from "../controllers/bridgeController.js";

const router = express.Router();

router.post("/", runBridgeSingle);

export default router;