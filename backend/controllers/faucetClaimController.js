import prisma from "../prisma/client.js";
import axios from "axios";

const FAUCET_URL = "https://testnet1faucet.aescnet.com/api/faucet/request"
const DELAY_MS = parseInt(process.env.DELAY_MS || "10000");

// ─── Helper: sleep between requests ──────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//claim faucet for one address
export const faucetClaim = async (walletId, address) => {

    try {

        console.log(`Claiming faucet for wallet ${walletId} (${address})`);

        const response = await axios.post(
            FAUCET_URL,
            { address },
            {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 15000,
            }
        )

        const data = response.data;
        const txHash = data.txHash;

        //save success to db

        const claim = await prisma.faucetClaim.create({
            data: {
                walletId,
                address,
                txHash,
                status: "success",
                amount: data.amount || '1.0',
                claimedAt: new Date(),
            },
        });

        console.log(`✅ Claimed faucet for wallet ${walletId} (${address}) | Tx: ${txHash}`);

        return { status: 'success', address, txHash, claimId: claim.id }

    }
    catch (error) {
        console.log(error);
        // Save failure to DB
        await prisma.faucetClaim.create({
            data: {
                walletId,
                address,
                status: 'failed',
                error: error.message,
            }
        });
        res.status(500).json({ error: "Failed to claim faucet" })
    }
}