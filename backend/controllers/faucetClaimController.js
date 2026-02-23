import prisma from "../prisma/client.js";

export const faucetClaim = async (req, res) => {
    try {

    }
    catch (error) {
        console.log(error);
        res.status(500).json({ error: "Failed to claim faucet" })
    }
}