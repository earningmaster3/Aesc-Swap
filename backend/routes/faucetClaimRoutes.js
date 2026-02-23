import express from "express";
import { faucetClaim, generateAndClaim } from "../controllers/faucetClaimController.js";
import prisma from "../prisma/client.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const { address } = req.body;

        if (!address) {
            return res.status(400).json({ error: "address is required" });
        }

        const wallet = await prisma.wallet.findUnique({ where: { address } });
        if (!wallet) return res.status(404).json({ error: "Wallet not found" });

        const result = await faucetClaim(wallet.id, address);
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/generateAndClaim", generateAndClaim)
export default router;