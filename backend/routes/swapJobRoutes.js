import express from "express";
import { swapJob, runSwapSingle, runSwapForAll, runSwapLeft } from "../controllers/swapJobController.js";

const router = express.Router();

router.post("/", swapJob);
router.post("/run-single", runSwapSingle);
router.post("/run-all", runSwapForAll);
router.post("/run-left", runSwapLeft);

export default router;