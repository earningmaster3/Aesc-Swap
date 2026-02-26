import prisma from "../prisma/client.js"
import { ethers, parseUnits } from "ethers"

// ─── Chain Config ─────────────────────────────────────
const AESC_RPC_URL = process.env.AESC_RPC_URL || "https://testnetrpc1.aescnet.com"; // ← ADD
const AESC_CHAIN_ID = parseInt(process.env.AESC_CHAIN_ID || "71602");                 // ← ADD
const DELAY_MS = parseInt(process.env.DELAY_MS || "10000");                      // ← ADD

// ─── Contract Addresses ───────────────────────────────
const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS || "0x241195a882Fa745f56b2f5B411eA2f2721045bA0";
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0x2F3a429D90e4aD9A4984EA98Ed05D3f6D69dFf37";
const DEST_CHAIN_ID = parseInt(process.env.DEST_CHAIN_ID || "56");
const BRIDGE_AMOUNT = process.env.BRIDGE_AMOUNT || "0.01";

// ─── ABIs ─────────────────────────────────────────────
const BRIDGE_ABI = [
    "function bridge(uint256 destChainId, address recipient, uint256 amount) external payable",
    "function getFee(uint256 destChainId) external view returns (uint256)",
    "function estimateFee(uint256 destChainId, uint256 amount) external view returns (uint256)",
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)",  // ← add this
];

// ─── Calculate bridge fee using estimateGas ───────────
const getBridgeFee = async (provider, bridgeContract, destChainId, address, amount) => {
    try {
        // estimate gas units needed for bridge()
        const gasUnits = await bridgeContract.bridge.estimateGas(
            destChainId,
            address,
            amount,
            { value: 0n }
        );
        console.log(`  ⛽ Gas units: ${gasUnits.toString()}`);

        // get current gas price from AESC chain
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice;
        console.log(`  ⛽ Gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);

        // fee = gasUnits × gasPrice
        const fee = gasUnits * gasPrice;
        console.log(`  💰 Calculated fee: ${ethers.formatUnits(fee, 6)} AEX`);

        return fee;

    } catch (err) {
        // fallback to fixed fee if estimation fails
        console.log(`  ⚠️ Fee estimation failed: ${err.message}`);
        console.log(`  💰 Using fixed fallback: 0.001 AEX`);
        return ethers.parseUnits("0.001", 18);
    }
};

export const bridgeJob = async (walletId, address, privateKey) => {
    try {
        console.log(`\n🌉 Bridging USDT for wallet ${walletId} (${address})`);

        const provider = new ethers.JsonRpcProvider(AESC_RPC_URL, {
            chainId: AESC_CHAIN_ID,
            name: "aesc-testnet",
        });

        const signer = new ethers.Wallet(privateKey, provider);
        const bridgeContract = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, signer);
        const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);

        const amount = ethers.parseUnits(BRIDGE_AMOUNT.toString(), 18);

        // ── Step 1: Check USDT balance ───────────────
        const balance = await tokenContract.balanceOf(address);
        console.log(`  💰 USDT Balance: ${ethers.formatUnits(balance, 18)} USDT`);

        if (balance < amount) {
            throw new Error(
                `Insufficient USDT. Has: ${ethers.formatUnits(balance, 18)} | Needs: ${BRIDGE_AMOUNT}`
            );
        }

        // ── Step 2: Approve USDT to bridge contract ──
        const allowance = await tokenContract.allowance(address, BRIDGE_ADDRESS);
        if (allowance < amount) {
            console.log(`  🔓 Approving USDT for bridge...`);
            const approveTx = await tokenContract.approve(BRIDGE_ADDRESS, ethers.MaxUint256);
            await approveTx.wait();
            console.log(`  ✅ Approved | TX: ${approveTx.hash}`);
        } else {
            console.log(`  ✅ Already approved`);
        }

        // ── Step 3: Bridge USDT → BSC ────────────────
        // ── Step 3: Calculate fee ────────────────────
        const fee = await getBridgeFee(
            provider,
            bridgeContract,
            DEST_CHAIN_ID,
            address,
            amount
        );
        console.log(`  🌉 Bridging ${BRIDGE_AMOUNT} USDT → BSC (chain ${DEST_CHAIN_ID})...`);


        const bridgeTx = await bridgeContract.bridge(
            DEST_CHAIN_ID,  // 56 = BSC
            address,        // recipient = same wallet on BSC
            amount,
            { value: fee }
        );

        console.log(`  ⏳ Waiting for confirmation... TX: ${bridgeTx.hash}`);
        await bridgeTx.wait();
        console.log(`  ✅ Bridge success! TX: ${bridgeTx.hash}`);

        // ── Step 4: Save to DB ───────────────────────
        const job = await prisma.bridgeJob.create({
            data: {
                walletId: parseInt(walletId),
                walletAddress: address,
                fromChainId: AESC_CHAIN_ID,
                toChainId: DEST_CHAIN_ID,
                tokenAddress: TOKEN_ADDRESS,
                amount: BRIDGE_AMOUNT.toString(),
                status: "success",
                txHash: bridgeTx.hash,
                attempts: 1,
                bridgedAt: new Date(),
            },
        });

        return { status: "success", address, txHash: bridgeTx.hash, jobId: job.id };

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
                    amount: BRIDGE_AMOUNT.toString(),
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

export const runBridgeSingle = async (req, res) => {
    try {

        const { address } = req.body;
        if (!address) {
            return res.status(400).json({ error: "address is required" });
        }
        const wallet = await prisma.wallet.findUnique({ where: { address } });
        if (!wallet) return res.status(404).json({ error: "Wallet not found" });
        const result = await bridgeJob(wallet.id, wallet.address, wallet.privateKey);
        res.json(result);

    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message })
    }
}