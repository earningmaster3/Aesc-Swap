import express from "express";
import { swapJob, runSwapSingle, runSwapForAll } from "../controllers/swapJobController.js";

const router = express.Router();

router.post("/", swapJob);
router.post("/run-single", runSwapSingle);
router.post("/run-all", runSwapForAll);

export default router;  