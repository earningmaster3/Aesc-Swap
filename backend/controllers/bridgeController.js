import prisma from "../prisma/client.js";
import { ethers } from "ethers"; // ← removed parseUnits, not needed

// ─── Chain Config ─────────────────────────────────────
const AESC_RPC_URL = process.env.AESC_RPC_URL;
const AESC_CHAIN_ID = parseInt(process.env.AESC_CHAIN_ID);
const DELAY_MS = parseInt(process.env.DELAY_MS);

// ─── Contract Addresses ───────────────────────────────
const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const DEST_CHAIN_ID = parseInt(process.env.DEST_CHAIN_ID);
const MIN_BRIDGE = process.env.MIN_BRIDGE;
const MAX_BRIDGE = process.env.MAX_BRIDGE;

// ─── Only ERC20 ABI needed ────────────────────────────
// no bridge ABI needed — just approve + transfer
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function decimals() external view returns (uint8)",
]

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────
// Core bridge function — approve + transfer to bridge
// ─────────────────────────────────────────────────────
export const bridgeJob = async (walletId, address, privateKey) => {
    const randomAmount = (Math.random() * (parseFloat(MAX_BRIDGE) - parseFloat(MIN_BRIDGE)) + parseFloat(MIN_BRIDGE)).toFixed(4);
    try {
        console.log(`\n🌉 Bridging USDT for wallet ${walletId} (${address})`);

        // ── Connect to AESC chain ─────────────────────
        const provider = new ethers.JsonRpcProvider(AESC_RPC_URL, {
            chainId: AESC_CHAIN_ID,
            name: "aesc-testnet",
        });

        if (!privateKey) {
            console.log(privateKey)
            throw new Error(`Wallet ${walletId} not found or missing privateKey`);
        }

        const signer = new ethers.Wallet(privateKey, provider);
        const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);

        // ── Get actual token decimals ─────────────────
        const decimals = await tokenContract.decimals();
        console.log(`  🔢 Token decimals: ${decimals}`);

        const amount = ethers.parseUnits(randomAmount.toString(), decimals);
        console.log(`  💵 Amount: ${randomAmount} USDT`);

        // ── Step 1: Check USDT balance ────────────────
        const balance = await tokenContract.balanceOf(address);
        console.log(`  💰 USDT Balance: ${ethers.formatUnits(balance, decimals)} USDT`);

        if (balance < amount) {
            throw new Error(
                `Insufficient USDT. Has: ${ethers.formatUnits(balance, decimals)} | Needs: ${randomAmount}`
            );
        }

        // ── Step 2: Approve bridge contract ──────────
        const allowance = await tokenContract.allowance(address, BRIDGE_ADDRESS);
        if (allowance < amount) {
            console.log(`  🔓 Approving USDT for bridge...`);
            const approveTx = await tokenContract.approve(
                BRIDGE_ADDRESS,
                ethers.MaxUint256
            );
            await approveTx.wait();
            console.log(`  ✅ Approved | TX: ${approveTx.hash}`);
        } else {
            console.log(`  ✅ Already approved`);
        }

        // ── Step 3: Transfer USDT to bridge contract ──
        console.log(`  📤 Transferring ${randomAmount} USDT to bridge contract...`);
        const transferTx = await tokenContract.transfer(
            BRIDGE_ADDRESS, // ← send to bridge contract address
            amount
        );

        console.log(`  ⏳ Waiting for confirmation... TX: ${transferTx.hash}`);
        await transferTx.wait();
        console.log(`  ✅ Transfer success! TX: ${transferTx.hash}`);

        // ── Step 4: Save success to DB ────────────────
        const job = await prisma.bridgeJob.create({
            data: {
                walletId: parseInt(walletId),
                walletAddress: address,
                fromChainId: AESC_CHAIN_ID,
                toChainId: DEST_CHAIN_ID,
                tokenAddress: TOKEN_ADDRESS,
                amount: randomAmount.toString(),
                status: "success",
                txHash: transferTx.hash, // ✅ fixed — was bridgeTx.hash
                attempts: 1,
                bridgedAt: new Date(),
            },
        });

        console.log(`  ✅ Saved to DB | Job ID: ${job.id}`);
        return { status: "success", address, txHash: transferTx.hash, jobId: job.id };

    } catch (error) {
        const errorMsg = error.reason || error.message;
        console.error(`❌ Bridge failed for ${address}: ${errorMsg}`);

        try {
            await prisma.bridgeJob.create({
                data: {
                    walletId: parseInt(walletId),
                    walletAddress: address,
                    fromChainId: AESC_CHAIN_ID,
                    toChainId: DEST_CHAIN_ID,
                    tokenAddress: TOKEN_ADDRESS,
                    amount: randomAmount.toString(),
                    status: "failed",
                    error: errorMsg,
                    attempts: 1,
                },
            });
        } catch (dbError) {
            console.error("Failed to save to DB:", dbError);
        }

        return { status: "failed", address, error: errorMsg };
    }
};

// ─────────────────────────────────────────────────────
// POST /api/bridge/single   { address }
// ─────────────────────────────────────────────────────
export const runBridgeSingle = async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "address is required" });

        const wallet = await prisma.wallet.findUnique({ where: { address } });
        if (!wallet) return res.status(404).json({ error: "Wallet not found" });

        const result = await bridgeJob(wallet.id, wallet.address, wallet.privateKey);
        res.json(result);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

// ─────────────────────────────────────────────────────
// POST /api/bridge/run-all
// only bridges wallets that swapped successfully
// ─────────────────────────────────────────────────────
export const runBridgeForAll = async (req, res) => {
    try {
        const swapJobs = await prisma.swapJob.findMany({
            where: {
                status: "success",
                wallet: {
                    bridgeJobs: { none: { status: "success" } }
                }
            },
            include: {
                wallet: {
                    select: { privateKey: true }  // ← use include for relations
                }
            }
        });

        if (swapJobs.length === 0) {
            return res.json({
                message: "No eligible wallets. Either no swaps or all already bridged.",
                total: 0,
            });
        }

        console.log(`\n🚀 Bridging for ${swapJobs.length} wallets...\n`);

        const results = { success: 0, failed: 0, total: swapJobs.length };

        for (let i = 0; i < swapJobs.length; i++) {
            const w = swapJobs[i];
            const result = await bridgeJob(w.walletId, w.address, w.wallet.privateKey);

            if (result.status === "success") results.success++;
            else results.failed++;

            console.log(`  📊 Progress: ${i + 1}/${swapJobs.length}`);

            if (i < swapJobs.length - 1) {
                console.log(`  ⏳ Waiting ${DELAY_MS}ms...\n`);
                await sleep(DELAY_MS);
            }
        }

        console.log(`\n🎉 Done! ✅ ${results.success} | ❌ ${results.failed}\n`);

        res.json({
            message: "Bridge complete",
            total: results.total,
            success: results.success,
            failed: results.failed,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};