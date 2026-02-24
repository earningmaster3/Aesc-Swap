import prisma from "../prisma/client";
import { ethers } from "ethers";

const AESC_URL = process.env.AESC_URL || "https://testnet-rpc.aesc.dev";
const AESC_CHAIN_ID = parseInt(process.env.AESC_CHAIN_ID || "71602");
const DELAY_MS = parseInt(process.env.DELAY_MS || "10000");
const SWAP_AMOUNT = parseFloat(process.env.SWAP_AMOUNT || "0.1");

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
export const swapJob = async (req, res) => {
    try {
        console.log(`🔄 Wrapping AEX -> WAEX for wallet ${walletId} (${address})`);

        // connect to AESC chain

        const provider = new ethers.JsonRpcApiProvider(AESC_URL, {
            chainId: AESC_CHAIN_ID,
            name: "AESC Testnet",

        })


        //signer -> wallet owner details(provider,privateKey)

        const signer = new ethers.Wallet(privateKey, provider);

        //waex contract instance
        const waexContract = new ethers.Contract(WAEX_ADDRESS, WAEX_ABI, signer);

        //the amount of AEX to swap

        const amountIn = ethers.parseUnits(SWAP_AMOUNT, 18);

        //get AEX wallet balance
        const balance = await waexContract.balanceOf(address);
        console.log(`  💰 AEX Balance: ${ethers.formatUnits(balance, 18)} AEX`)

        //if swap amount (aex) less than balamce in wallet

        if (balance < amountIn) {
            throw new Error(
                `Insufficient AEX. Has: ${ethers.formatUnits(balance, 18)} | Needs: ${SWAP_AMOUNT}`
            );
        }

        //convert to WAEX
        const balanceEther = ethers.formatEther(balance);

        //check if balance is enough for swap
        if (balanceEther < SWAP_AMOUNT) {
            console.log(`Wallet ${walletId} (${address}) has insufficient balance for swap`);
            return { status: 'failed', address, error: 'Insufficient balance' };
        }

        //approve waex contract to spend AEX
        const approveTx = await waexContract.approve(WAEX_ADDRESS, balance);
        await approveTx.wait();

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
        res.status(500).json({ error: "Internal server error" });
    }
}
