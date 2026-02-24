import prisma from "../prisma/client.js";
import axios from "axios";
import { ethers } from "ethers";

const FAUCET_URL = process.env.FAUCET_URL || "https://testnet1faucet.aescnet.com/api/faucet/request";
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

        // save success to db
        const claim = await prisma.faucetClaim.create({
            data: {
                walletId: parseInt(walletId),
                address,
                txHash,
                status: "success",
                amount: data.amount || '1.0',
                claimedAt: new Date(),
            },
        });

        console.log(`✅ Claimed faucet for wallet ${walletId} (${address}) | Tx: ${txHash}`);

        return ({ status: 'success', address, txHash, claimId: claim.id })

    }
    catch (error) {
        console.log(error);
        // Save failure to DB
        try {
            await prisma.faucetClaim.create({
                data: {
                    walletId: parseInt(walletId),
                    address,
                    status: 'failed',
                    error: error.message,
                }
            });
        } catch (dbError) {
            console.error("Failed to persist faucet claim error:", dbError);
        }
        return { status: 'failed', address, error: error.message };
    }
}

//Generate 50 wallets and claim faucet for each

export const generateAndClaim = async (req, res) => {
    try {

        const count = parseInt(req.body.count || 3);

        if (isNaN(count) || count < 1 || count > 100) {
            return res.status(400).json({ error: "Count must be between 1 and 100" });
        }


        console.log(`Generating ${count} wallets and claiming faucet for each`);

        const results = { walletCreated: 0, claimSuccess: 0, claimFailed: 0, wallets: [] };

        for (let i = 0; i < count; i++) {
            //step-1 : generate random wallet
            const randomWallet = ethers.Wallet.createRandom();

            //step-2 : check if wallet is already exists
            const existWallet = await prisma.wallet.findFirst({
                where: {
                    OR: [
                        { address: randomWallet.address },
                        { privateKey: randomWallet.privateKey }
                    ]
                }
            })

            if (existWallet) {
                results.walletCreated++;
                continue;
            }

            //step-3 : save wallet to db
            const wallet = await prisma.wallet.create({
                data: {
                    address: randomWallet.address,
                    privateKey: randomWallet.privateKey,
                },
            });

            results.walletCreated++;

            //step-4 : claim faucet
            const claimResult = await faucetClaim(wallet.id, wallet.address);

            if (claimResult.status === 'success') {
                results.claimSuccess++;
            } else {
                if (claimResult.status === 'failed') {
                    return res.status(502).json(claimResult);
                }
                res.json(claimResult);
                results.claimFailed++;
            }

            //step-5 : push wallet to array
            results.wallets.push({
                id: wallet.id,
                address: wallet.address,
                privateKey: wallet.privateKey,
            })

            //step-6 : show progress
            if ((i + 1) % 10 === 0) {
                console.log(`  ✅ ${i + 1}/${count} wallets generated`);
            }
            // Delay between claims to avoid rate limiting
            if (i < count - 1) {
                await sleep(DELAY_MS);
            }
        }


    } catch (error) {
        console.error("Faucet claim route error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}