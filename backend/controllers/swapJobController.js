import prisma from "../prisma/client.js";
import { ethers } from "ethers";

const AESC_URL = process.env.AESC_URL || "https://testnetrpc1.aescnet.com";
const AESC_CHAIN_ID = parseInt(process.env.AESC_CHAIN_ID || "71602");
const DELAY_MS = parseInt(process.env.DELAY_MS || "10000");
const MIN_SWAP = process.env.MIN_SWAP || "0.01";
const MAX_SWAP = process.env.MAX_SWAP || "0.2";

//waex contract address
const WAEX_ADDRESS = process.env.WAEX_ADDRESS || "0x05BE4146EAc85E380fB71ec6A4b97bA325cd53EE";

//WAEX contract abi
const WAEX_ABI = [
    "function deposit() external payable",
    "function withdraw(uint256 amount) external",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Core wrap function — AEX → WAEX for single wallet
export const swapJob = async (walletId, address) => {
    const randomAmount = (Math.random() * (parseFloat(MAX_SWAP) - parseFloat(MIN_SWAP)) + parseFloat(MIN_SWAP)).toFixed(4);
    try {
        console.log(`🔄 Wrapping AEX -> WAEX for wallet ${walletId} (${address})`);

        // connect to AESC chain

        const provider = new ethers.JsonRpcProvider(AESC_URL);

        const network = await provider.getNetwork();
        console.log("Connected to chain:", network.chainId);


        //signer -> wallet owner details(provider,privateKey)

        const walletData = await prisma.wallet.findUnique({
            where: { id: walletId }
        });
        if (!walletData?.privateKey) {
            throw new Error(`Wallet ${walletId} not found or missing privateKey`);
        }
        const signer = new ethers.Wallet(walletData.privateKey, provider);


        //waex contract instance
        const waexContract = new ethers.Contract(WAEX_ADDRESS, WAEX_ABI, signer);

        //the amount of AEX to swap

        const amountIn = ethers.parseUnits(randomAmount.toString(), 18);
        const amountOut = ethers.formatUnits(amountIn, 18);

        //get AEX wallet balance
        const balance = await provider.getBalance(address);
        console.log(`  💰 AEX Balance: ${ethers.formatUnits(balance, 18)} AEX`)

        //if swap amount (aex) less than balamce in wallet

        if (balance < amountIn) {
            throw new Error(
                `Insufficient AEX. Has: ${ethers.formatUnits(balance, 18)} | Needs: ${randomAmount}`
            );
        }


        //wrap AEX to WAEX
        const wrapTx = await waexContract.deposit({ value: amountIn });
        await wrapTx.wait();

        //save success to db
        const swapJob = await prisma.swapJob.create({
            data: {
                walletId: parseInt(walletId),
                address,
                tokenIn: 'AEX',
                tokenOut: WAEX_ADDRESS,
                amountIn: randomAmount,
                amountOut,
                status: 'success',
                txHash: wrapTx.hash,
                attempt: 1,
                swappedAt: new Date(),
            },
        });

        console.log(`✅ Wrapped AEX -> WAEX for wallet ${walletId} (${address}) | Tx: ${wrapTx.hash}`);

        return { status: 'success', address, txHash: wrapTx.hash, swapJobId: swapJob.id };
    } catch (error) {
        console.error("Swap job route error:", error);
        try {
            await prisma.swapJob.create({
                data: {
                    walletId: parseInt(walletId),
                    address,
                    tokenIn: "AEX",
                    tokenOut: WAEX_ADDRESS,
                    amountIn: randomAmount,
                    status: "failed",
                    error: error.message,
                    attempt: 1,
                },
            });
        } catch (dbError) {
            console.error("Failed to save error to DB:", dbError);

        }

    }
}
//run swap job for single wallet
export const runSwapSingle = async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "address is required" });

        const wallet = await prisma.wallet.findUnique({ where: { address } });
        if (!wallet) return res.status(404).json({ error: "Wallet not found" });

        const result = await swapJob(wallet.id, wallet.address);
        res.json(result);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
//swap job for all wallets
export const runSwapForAll = async (req, res) => {
    try {
        // ✅ Only wallets that claimed faucet successfully AND not yet swapped
        const faucetClaims = await prisma.faucetClaim.findMany({
            where: {
                status: "success",
                wallet: {
                    swapJobs: { none: { status: "success" } }
                }
            },
            select: {
                walletId: true,
                address: true,
            }
        });

        if (faucetClaims.length === 0) {
            return res.status(200).json({
                message: "No eligible wallets found. Either no faucet claims or all already swapped.",
                total: 0
            });
        }

        console.log(`\n🚀 Starting AEX → WAEX wrap for ${faucetClaims.length} wallets...\n`);

        const results = { success: 0, failed: 0, total: faucetClaims.length };

        for (let i = 0; i < faucetClaims.length; i++) {
            const w = faucetClaims[i];
            const result = await swapJob(w.walletId, w.address);

            if (result?.status === "success") results.success++;
            else results.failed++;

            console.log(`  📊 Progress: ${i + 1}/${faucetClaims.length}`);

            if (i < faucetClaims.length - 1) {
                console.log(`  ⏳ Waiting ${DELAY_MS}ms...\n`);
                await sleep(DELAY_MS);
            }
        }

        console.log(`\n🎉 Done! ✅ ${results.success} | ❌ ${results.failed}\n`);

        res.status(200).json({
            message: "AEX → WAEX wrap complete",
            total: results.total,
            success: results.success,
            failed: results.failed,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

// Run swap job for all wallets even if already swapped
export const runSwapLeft = async (req, res) => {
    try {
        // ✅ All wallets that claimed faucet successfully (regardless of previous swap status)
        const faucetClaims = await prisma.faucetClaim.findMany({
            where: {
                status: "success",
            },
            select: {
                walletId: true,
                address: true,
            }
        });

        if (faucetClaims.length === 0) {
            return res.status(200).json({
                message: "No eligible wallets found with successful faucet claims.",
                total: 0
            });
        }

        console.log(`\n🚀 Starting AEX → WAEX re-wrap for ${faucetClaims.length} wallets...\n`);

        const results = { success: 0, failed: 0, total: faucetClaims.length };

        for (let i = 0; i < faucetClaims.length; i++) {
            const w = faucetClaims[i];
            const result = await swapJob(w.walletId, w.address);

            if (result?.status === "success") results.success++;
            else results.failed++;

            console.log(`  📊 Progress: ${i + 1}/${faucetClaims.length}`);

            if (i < faucetClaims.length - 1) {
                console.log(`  ⏳ Waiting ${DELAY_MS}ms...\n`);
                await sleep(DELAY_MS);
            }
        }

        console.log(`\n🎉 Done! ✅ ${results.success} | ❌ ${results.failed}\n`);

        res.status(200).json({
            message: "AEX → WAEX re-wrap complete",
            total: results.total,
            success: results.success,
            failed: results.failed,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
