import express from "express";
import { faucetClaim } from "../controllers/faucetClaimController.js";

const router = express.Router();

router.post("/", faucetClaim);

export default router;