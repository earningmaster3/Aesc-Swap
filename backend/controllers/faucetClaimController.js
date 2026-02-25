import prisma from "../prisma/client.js";
import axios from "axios";
import { ethers } from "ethers";
import { HttpsProxyAgent } from "https-proxy-agent";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const FAUCET_URL = process.env.FAUCET_URL || "https://testnet1faucet.aescnet.com/api/faucet/request";
const DELAY_MS = parseInt(process.env.DELAY_MS || "10000");

//Load proxies from proxy.txt

const loadProxies = () => {
    try {

        const proxyPath = path.join(__dirname, "../../proxy.txt");
        console.log(`📂 Looking for proxy.txt at: ${proxyPath}`);
        console.log(`📂 __dirname is: ${__dirname}`);
        const proxies = fs.readFileSync(proxyPath, "utf8").split("\n").map(p => p.trim()).filter(Boolean);
        console.log(`✅ Loaded ${proxies.length} proxies`);
        return proxies;

    } catch (error) {
        console.log("⚠️ Failed to load proxies");
        console.error(error);
        return [];
    }
}

const PROXY_LIST = loadProxies();

//Get random proxies
const getRandomProxy = () => {
    if (PROXY_LIST.length === 0) return null;
    const proxy = PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)]
    console.log(` 🌐 Using proxy: ${proxy}`);
    return proxy;
}


// ─── Helper: sleep between requests ──────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//claim faucet for one address
export const faucetClaim = async (walletId, address) => {
    const maxProxyAttempts = 5; // Try up to 5 different proxies
    let lastError = null;

    for (let attempt = 1; attempt <= maxProxyAttempts; attempt++) {
        try {
            console.log(`Claiming faucet for wallet ${walletId} (${address}) - Proxy Attempt ${attempt}/${maxProxyAttempts}`);

            const proxy = getRandomProxy();
            const axiosConfig = {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 15000,
            }

            if (proxy) {
                axiosConfig.httpAgent = new HttpsProxyAgent(proxy);
                axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
            }

            const response = await axios.post(
                FAUCET_URL,
                { address },
                axiosConfig
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

        } catch (error) {
            lastError = error;
            const isRateLimited = error.response?.status === 429;
            const errorMsg = error.response?.data?.message || error.message;

            console.error(`❌ Attempt ${attempt} failed for wallet ${walletId} (${address}) | Error: ${errorMsg}`);

            if (isRateLimited && attempt < maxProxyAttempts) {
                console.log("⚠️ Rate limited (429). Will try a different proxy immediately...");
                continue; // Skip to next iteration of the loop (different proxy)
            } else {
                // Not a 429 error OR we've exhausted retry attempts, so we stop and log the failure
                break;
            }
        }
    }

    // Save failure to DB
    const finalErrorMsg = lastError?.response?.data?.message || lastError?.message || "Unknown error";
    try {
        await prisma.faucetClaim.create({
            data: {
                walletId: parseInt(walletId),
                address,
                status: 'failed',
                error: finalErrorMsg,
            }
        });
    } catch (dbError) {
        console.error("Failed to persist faucet claim error:", dbError);
    }
    return { status: 'failed', address, error: finalErrorMsg };
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

        res.json(results);

    } catch (error) {
        console.error("Faucet claim route error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}