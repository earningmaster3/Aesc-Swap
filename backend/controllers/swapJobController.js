import prisma from "../prisma/client.js";
import { ethers } from "ethers";

const AESC_URL = process.env.AESC_URL || "https://testnetrpc1.aescnet.com";
const AESC_CHAIN_ID = parseInt(process.env.AESC_CHAIN_ID || "71602");
const DELAY_MS = parseInt(process.env.DELAY_MS || "10000");
const SWAP_AMOUNT = process.env.SWAP_AMOUNT || "0.1";

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

        const signer = new ethers.Wallet(walletData.privateKey, provider);

        //waex contract instance
        const waexContract = new ethers.Contract(WAEX_ADDRESS, WAEX_ABI, signer);

        //the amount of AEX to swap

        const amountIn = ethers.parseUnits(SWAP_AMOUNT.toString(), 18);
        const amountOut = ethers.formatUnits(amountIn, 18);

        //get AEX wallet balance
        const balance = await provider.getBalance(address);
        console.log(`  💰 AEX Balance: ${ethers.formatUnits(balance, 18)} AEX`)

        //if swap amount (aex) less than balamce in wallet

        if (balance < amountIn) {
            throw new Error(
                `Insufficient AEX. Has: ${ethers.formatUnits(balance, 18)} | Needs: ${SWAP_AMOUNT}`
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
                amountIn: SWAP_AMOUNT,
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
                    amountIn: SWAP_AMOUNT,
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
        const wallets = await prisma.wallet.findMany({
            where: {
                swapJobs: { none: { status: "success" } }
            },
            select: { id: true, address: true }
        });

        if (wallets.length === 0) {
            return res.status(200).json({ message: "All wallets already wrapped AEX → WAEX", total: 0 });
        }

        console.log(`\n🚀 Starting AEX → WAEX wrap for ${wallets.length} wallets...\n`);

        const results = { success: 0, failed: 0, total: wallets.length };

        for (let i = 0; i < wallets.length; i++) {
            const w = wallets[i];
            const result = await swapJob(w.id, w.address);

            if (result.status === "success") results.success++;
            else results.failed++;

            console.log(`  📊 Progress: ${i + 1}/${wallets.length}`);

            if (i < wallets.length - 1) {
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