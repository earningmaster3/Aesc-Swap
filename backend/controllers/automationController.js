import prisma from "../prisma/client.js";
import { ethers } from "ethers";
import { faucetClaim } from "./faucetClaimController.js";
import { swapJob } from "./swapJobController.js";
import { bridgeJob } from "./bridgeController.js";

const AESC_RPC_URL = process.env.AESC_RPC_URL;
const AESC_CHAIN_ID = parseInt(process.env.AESC_CHAIN_ID);
const DELAY_MS = parseInt(process.env.DELAY_MS);
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const USDT_AMOUNT = process.env.USDT_AMOUNT;
const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY;

const ERC20_ABI = [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────
// Send USDT from sender wallet to target wallet
// ─────────────────────────────────────────────────────
const sendUSDT = async (toAddress) => {
    try {
        const provider = new ethers.JsonRpcProvider(AESC_RPC_URL, {
            chainId: AESC_CHAIN_ID,
            name: "aesc-testnet",
        });
        const senderWallet = new ethers.Wallet(SENDER_PRIVATE_KEY, provider);
        const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, senderWallet);

        const decimals = await tokenContract.decimals();
        const amount = ethers.parseUnits(USDT_AMOUNT.toString(), decimals);

        console.log(`  📤 Sending ${USDT_AMOUNT} USDT → ${toAddress}`);
        const tx = await tokenContract.transfer(toAddress, amount);
        await tx.wait();
        console.log(`  ✅ USDT sent! TX: ${tx.hash}`);

        return { status: "success", txHash: tx.hash };

    } catch (error) {
        console.error(`  ❌ USDT send failed: ${error.message}`);
        return { status: "failed", error: error.message };
    }
};

// ─────────────────────────────────────────────────────
// Core automation logic
// ─────────────────────────────────────────────────────
export const executeAutomation = async (count) => {
    try {
        if (!SENDER_PRIVATE_KEY) {
            throw new Error("SENDER_PRIVATE_KEY not set in .env");
        }

        console.log(`\n${'═'.repeat(50)}`);
        console.log(`🤖 Full Automation for ${count} wallets (via Cron/API)`);
        console.log(`${'═'.repeat(50)}\n`);

        const results = {
            total: count,
            faucetSuccess: 0,
            faucetFailed: 0,
            swapSuccess: 0,
            swapFailed: 0,
            usdtSuccess: 0,
            usdtFailed: 0,
            bridgeSuccess: 0,
            bridgeFailed: 0,
            wallets: [],
        };

        for (let i = 0; i < count; i++) {
            console.log(`\n${'─'.repeat(50)}`);
            console.log(`🔁 Wallet ${i + 1}/${count}`);
            console.log(`${'─'.repeat(50)}`);

            const walletResult = {
                address: null,
                faucet: "pending",
                swap: "skipped",
                usdt: "skipped",
                bridge: "skipped",
            };

            // ── Step 1: Generate wallet ───────────────
            const randomWallet = ethers.Wallet.createRandom();

            const existing = await prisma.wallet.findFirst({
                where: {
                    OR: [
                        { address: randomWallet.address },
                        { privateKey: randomWallet.privateKey },
                    ]
                }
            });

            if (existing) {
                console.log(`  ⚠️ Wallet exists, skipping...`);
                continue;
            }

            const wallet = await prisma.wallet.create({
                data: {
                    address: randomWallet.address,
                    privateKey: randomWallet.privateKey,
                }
            });

            walletResult.address = wallet.address;
            console.log(`  🔑 Wallet: ${wallet.address}`);

            // ── Step 2: Faucet claim ──────────────────
            console.log(`\n  📍 STEP 2: Faucet claim...`);
            const faucetResult = await faucetClaim(wallet.id, wallet.address);

            if (faucetResult.status === "success") {
                results.faucetSuccess++;
                walletResult.faucet = "success";
                console.log(`  ✅ Faucet! TX: ${faucetResult.txHash}`);
            } else {
                results.faucetFailed++;
                walletResult.faucet = "failed";
                console.log(`  ❌ Faucet failed — skipping remaining steps`);
                results.wallets.push(walletResult);
                await sleep(DELAY_MS);
                continue; // ← skip swap, usdt, bridge
            }

            // ── Step 3: Swap AEX → WAEX ───────────────
            console.log(`\n  📍 STEP 3: Swap AEX → WAEX...`);
            const swapResult = await swapJob(wallet.id, wallet.address);

            if (swapResult?.status === "success") {
                results.swapSuccess++;
                walletResult.swap = "success";
                console.log(`  ✅ Swap! TX: ${swapResult.txHash}`);
            } else {
                results.swapFailed++;
                walletResult.swap = "failed";
                console.log(`  ❌ Swap failed — skipping USDT + bridge`);
                results.wallets.push(walletResult);
                await sleep(DELAY_MS);
                continue; // ← skip usdt send and bridge
            }

            // ── Step 4: Send USDT to wallet ────────────
            console.log(`\n  📍 STEP 4: Sending ${USDT_AMOUNT} USDT...`);
            const usdtResult = await sendUSDT(wallet.address);

            if (usdtResult.status === "success") {
                results.usdtSuccess++;
                walletResult.usdt = "success";
                console.log(`  ✅ USDT sent!`);
            } else {
                results.usdtFailed++;
                walletResult.usdt = "failed";
                console.log(`  ❌ USDT send failed — skipping bridge`);
                results.wallets.push(walletResult);
                await sleep(DELAY_MS);
                continue; // ← skip bridge if no USDT
            }

            // ── Step 5: Bridge USDT → BSC ─────────────
            console.log(`\n  📍 STEP 5: Bridging USDT → BSC...`);
            const bridgeResult = await bridgeJob(
                wallet.id,
                wallet.address,
                wallet.privateKey
            );

            if (bridgeResult?.status === "success") {
                results.bridgeSuccess++;
                walletResult.bridge = "success";
                console.log(`  ✅ Bridge! TX: ${bridgeResult.txHash}`);
            } else {
                results.bridgeFailed++;
                walletResult.bridge = "failed";
                console.log(`  ❌ Bridge failed`);
            }

            results.wallets.push(walletResult);

            // ── Delay before next wallet ───────────────
            if (i < count - 1) {
                console.log(`\n  ⏳ Waiting ${DELAY_MS}ms...\n`);
                await sleep(DELAY_MS);
            }
        }

        // ── Final Summary ─────────────────────────────
        console.log(`\n${'═'.repeat(50)}`);
        console.log(`🎉 Automation Complete!`);
        console.log(`   Total    : ${results.total}`);
        console.log(`   Faucet   : ✅ ${results.faucetSuccess} | ❌ ${results.faucetFailed}`);
        console.log(`   Swap     : ✅ ${results.swapSuccess}   | ❌ ${results.swapFailed}`);
        console.log(`   USDT     : ✅ ${results.usdtSuccess}   | ❌ ${results.usdtFailed}`);
        console.log(`   Bridge   : ✅ ${results.bridgeSuccess} | ❌ ${results.bridgeFailed}`);
        console.log(`${'═'.repeat(50)}\n`);

        return {
            success: true,
            summary: {
                total: results.total,
                faucetSuccess: results.faucetSuccess,
                faucetFailed: results.faucetFailed,
                swapSuccess: results.swapSuccess,
                swapFailed: results.swapFailed,
                usdtSuccess: results.usdtSuccess,
                usdtFailed: results.usdtFailed,
                bridgeSuccess: results.bridgeSuccess,
                bridgeFailed: results.bridgeFailed,
            },
            wallets: results.wallets,
        };

    } catch (error) {
        console.error("Automation execution error:", error.message);
        return { success: false, error: error.message };
    }
};

// ─────────────────────────────────────────────────────
// POST /api/automation/run
// ─────────────────────────────────────────────────────
export const fullAutomation = async (req, res) => {
    try {
        const count = parseInt(req.body.count);
        if (!count) return res.status(400).json({ message: "Count is required" });

        const result = await executeAutomation(count);

        if (result.success) {
            res.json({
                message: "Full automation complete ✅",
                summary: result.summary,
                wallets: result.wallets,
            });
        } else {
            res.status(500).json({ error: result.error });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};
