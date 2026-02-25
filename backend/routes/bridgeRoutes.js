import express from "express";
import { bridgeJob } from "../controllers/bridgeController.js";

const router = express.Router();

router.post("/", bridgeJob);

export default router;