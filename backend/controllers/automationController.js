import prisma from "../prisma/client.js";
import { ethers } from "ethers";
import { faucetClaim } from "./faucetClaimController.js";
import { swapJob } from "./swapJobController.js";


const DELAY_MS = parseInt(process.env.DELAY_MS || "10000");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const fullAutomation = async (req, res) => {
    try {
        const count = parseInt(req.body.count);
        if (!count) return res.status(400).json({ message: "Count is required" });

        console.log(`\n🤖 Starting automation for ${count} wallets...\n`);

        const results = {
            total: count,
            faucetSuccess: 0,
            faucetFailed: 0,
            swapSuccess: 0,
            swapFailed: 0,
            wallets: [],
        };

        for (let i = 0; i < count; i++) {
            console.log(`\n${'─'.repeat(50)}`);
            console.log(`🔁 Wallet ${i + 1}/${count}`);
            console.log(`${'─'.repeat(50)}`);

            // ── Step 1: Generate wallet ───────────────
            const randomWallet = ethers.Wallet.createRandom();

            const existWallet = await prisma.wallet.findFirst({
                where: {
                    OR: [
                        { address: randomWallet.address },
                        { privateKey: randomWallet.privateKey },
                    ]
                }
            });

            if (existWallet) {
                console.log(`  ⚠️ Wallet already exists, skipping...`);
                continue;
            }

            const wallet = await prisma.wallet.create({
                data: {
                    address: randomWallet.address,
                    privateKey: randomWallet.privateKey,
                }
            });

            console.log(`  🔑 Wallet created: ${wallet.address}`);

            // ── Step 2: Claim faucet ──────────────────
            console.log(`  📍 Claiming faucet...`);
            const faucetResult = await faucetClaim(wallet.id, wallet.address);

            if (faucetResult.status === "success") {
                results.faucetSuccess++;
                console.log(`  ✅ Faucet claimed! TX: ${faucetResult.txHash}`);
            } else {
                results.faucetFailed++;
                console.log(`  ❌ Faucet failed: ${faucetResult.error}`);

                // skip swap if faucet failed — no AEX balance
                results.wallets.push({
                    address: wallet.address,
                    faucet: "failed",
                    swap: "skipped",
                });
                if (i < count - 1) await sleep(DELAY_MS);
                continue; // ← go to next wallet
            }

            // ── Step 3: Swap AEX → WAEX ───────────────
            console.log(`  📍 Swapping AEX → WAEX...`);
            const swapResult = await swapJob(wallet.id, wallet.address);

            if (swapResult?.status === "success") {
                results.swapSuccess++;
                console.log(`  ✅ Swap done! TX: ${swapResult.txHash}`);
            } else {
                results.swapFailed++;
                console.log(`  ❌ Swap failed: ${swapResult?.error}`);
            }

            results.wallets.push({
                address: wallet.address,
                faucet: faucetResult.status,
                swap: swapResult?.status || "failed",
            });

            // ── Delay before next wallet ───────────────
            if (i < count - 1) {
                console.log(`\n  ⏳ Waiting ${DELAY_MS}ms before next wallet...\n`);
                await sleep(DELAY_MS);
            }
        }

        // ── Final Summary ─────────────────────────────
        console.log(`\n${'═'.repeat(50)}`);
        console.log(`🎉 Automation complete!`);
        console.log(`   Total wallets  : ${results.total}`);
        console.log(`   Faucet success : ${results.faucetSuccess}`);
        console.log(`   Faucet failed  : ${results.faucetFailed}`);
        console.log(`   Swap success   : ${results.swapSuccess}`);
        console.log(`   Swap failed    : ${results.swapFailed}`);
        console.log(`${'═'.repeat(50)}\n`);

        res.json({
            message: "Automation complete ✅",
            summary: {
                total: results.total,
                faucetSuccess: results.faucetSuccess,
                faucetFailed: results.faucetFailed,
                swapSuccess: results.swapSuccess,
                swapFailed: results.swapFailed,
            },
            wallets: results.wallets,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};