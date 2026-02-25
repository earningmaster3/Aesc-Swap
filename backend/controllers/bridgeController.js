import prisma from "../prisma/client.js"
import { ethers, parseUnits } from "ethers"

//Bridging for a single address

const AESC_RPC_URL = process.env.AESC_RPC_URL || "https://testnetrpc1.aescnet.com";
const AESC_CHAIN_ID = process.env.AESC_CHAIN_ID || `71602`
const DELAY_MS = process.env.DELAY_MS || `10000`
const BRIDGE_AMOUNT = process.env.BRIDGE_AMOUNT || `0.01`

//Destination contract address

const BRIDGE_ADDRESS = process.env.BRIDGE_ADDRESS || "0x241195a882Fa745f56b2f5B411eA2f2721045bA0"
const DEST_CHAIN_ID = parseInt(process.env.DEST_CHAIN_ID || "56")
const DEST_ADDRESS = process.env.DEST_ADDRESS || "0x2F3a429D90e4aD9A4984EA98Ed05D3f6D69dFf37"

// ─── Bridge ABI ───────────────────────────────────────
// ⚠️  This is a generic bridge ABI — update after inspecting bridge.aescnet.com
// Common bridge function signatures — one of these will match:
const BRIDGE_ABI = [
    // Pattern 1 — most common
    "function bridge(address token, uint256 amount, uint256 destChainId, address recipient) external payable",
    // Pattern 2 — native token bridge
    "function bridgeNative(uint256 destChainId, address recipient) external payable",
    // Pattern 3 — LayerZero style
    "function send(uint16 _dstChainId, bytes calldata _toAddress, uint256 _amount) external payable",
    // Pattern 4 — simple transfer
    "function transferCrossChain(address to, uint256 amount, uint256 chainId) external payable",
    // Get bridge fee
    "function estimateFee(uint256 destChainId, uint256 amount) external view returns (uint256)",
    "function getFee(uint256 destChainId) external view returns (uint256)",
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const bridgeJob = async (walletId, address, privateKey) => {
    try {
        //core bridge function for a single wallet

        console.log(`🌉 Bridging for wallet ${walletId} (${walletAddress})`)

        //connect to aesc chain

        const provider = new ethers.JsonRpcApiProvider(AESC_RPC_URL, {
            chainId: AESC_CHAIN_ID,
            name: "aesc-testnet"
        })

        const signer = new ethers.Wallet(privateKey, provider)
        const bridgeContract = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, signer)
        const tokenContract = new ethers.Contract(DEST_ADDRESS, ERC20_ABI, signer)

        const amount = ethers.parseUnits(BRIDGE_AMOUNT, 18);

        const balance = await tokenContract.balanceOf(walletAddress)
        console.log(`💰 Balance: ${ethers.formatUnits(balance, 18)} WAEX`)

        //step-1 check balance

        if (balance < amount) {
            throw new Error(`Insufficient balance. Has: ${ethers.formatUnits(balance, 18)} | Needs: ${BRIDGE_AMOUNT}`);
        }

        //step-2 approve bridge 
        const allowance = await tokenContract.allowance(walletAddress, BRIDGE_CONTRACT);
        if (allowance < amount) {
            console.log(`  🔓 Approving bridge for wallet ${walletId}...`);
            const approveTx = await tokenContract.approve(BRIDGE_ADDRESS, ethers.MaxUint256);
            await approveTx.wait();
            console.log(`  ✅ Approved | TX: ${approveTx.hash}`);
        }

        //get bridge fee
        const fee = await bridgeContract.getFee(DEST_CHAIN_ID);
        console.log(`  📊 Fee: ${ethers.formatUnits(fee, 18)} WAEX`)

        //step-3 bridge
        const bridgeTx = await bridgeContract.bridge(DEST_ADDRESS, amount, DEST_CHAIN_ID, walletAddress, { value: fee });
        await bridgeTx.wait();
        console.log(`  ✅ Bridged | TX: ${bridgeTx.hash}`)

        //save success to db
        const job = await prisma.bridgeJob.create({
            data: {
                walletId: parseInt(walletId),
                address: walletAddress,
                tokenIn: 'WAEX',
                tokenOut: DEST_ADDRESS,
                amountIn: BRIDGE_AMOUNT,
                amountOut: ethers.formatUnits(amount, 18),
                status: 'success',
                txHash: bridgeTx.hash,
                attempt: 1,
                bridgedAt: new Date(),
            },
        });

        console.log(`  ✅ Bridged | TX: ${bridgeTx.hash}`)
        return { status: "success", address, txHash: bridgeTx.hash, jobId: job.id };
    } catch (error) {
        console.log(error)
        const errorMsg = error.message;
        console.error(`❌ Bridge failed for wallet ${walletId} (${walletAddress}): ${errorMsg}`);
    }
}

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