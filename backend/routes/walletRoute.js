import express from "express";
import { createWallet, generateWallets } from "../controllers/walletController.js"
import { getAllWallets } from "../controllers/walletController.js"

const router = express.Router();

router.post("/", createWallet)
router.post("/generate", generateWallets)
router.get("/", getAllWallets)


export default router;
