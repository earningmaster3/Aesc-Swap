import express from "express";
import { runBridgeSingle, runBridgeForAll } from "../controllers/bridgeController.js";

const router = express.Router();

router.post("/bridge-single", runBridgeSingle);
router.post("/bridge-all", runBridgeForAll);

export default router;