import express from "express";
import { swapJob } from "../controllers/swapJobController.js";

const router = express.Router();

router.post("/", swapJob);

export default router;  