import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const ENV = {
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL, //local host
    NODE_ENV: process.env.NODE_ENV,//postgres
    FRONTEND_URL: process.env.FRONTEND_URL,

    // Aesc Testnet
    AESC_RPC_URL: process.env.AESC_RPC_URL,
    AESC_CHAIN_ID: process.env.AESC_CHAIN_ID,

    // Faucet
    FAUCET_URL: process.env.FAUCET_URL,
    PROXY_URL: process.env.PROXY_URL,

    // Swap
    WAEX_ADDRESS: process.env.WAEX_ADDRESS,
    MIN_SWAP: process.env.MIN_SWAP,
    MAX_SWAP: process.env.MAX_SWAP,

    // Bridge
    BRIDGE_ADDRESS: process.env.BRIDGE_ADDRESS,
    DEST_CHAIN_ID: process.env.DEST_CHAIN_ID,
    MIN_BRIDGE: process.env.MIN_BRIDGE,
    MAX_BRIDGE: process.env.MAX_BRIDGE,

    // USDT Sender
    SENDER_PRIVATE_KEY: process.env.SENDER_PRIVATE_KEY,
    USDT_AMOUNT: process.env.USDT_AMOUNT,

    // Delay
    DELAY_MS: process.env.DELAY_MS,
}