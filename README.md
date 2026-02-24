# Aesc Swap Automation

A comprehensive automation tool for the AESC Network testnet that streamlines wallet management, faucet claiming, and token swapping operations.

## Overview

This project automates the entire workflow of creating unlimited Ethereum wallets, claiming testnet tokens from faucets, and performing AEX to WAEX token swaps on the AESC Network testnet. It includes retry mechanisms, database persistence, and comprehensive tracking of all operations.

## Features

### 🔐 Wallet Management
- **Unlimited Wallet Generation**: Automatically generate unlimited Ethereum wallets using ethers.js
- **Manual Wallet Import**: Import existing wallets with private keys
- **Duplicate Detection**: Prevents duplicate wallet creation
- **Database Persistence**: All wallets stored securely in PostgreSQL with Prisma ORM

### 💧 Faucet Claiming
- **Automated Faucet Claims**: Claim testnet AEX tokens from the AESC faucet
- **Rate Limit Handling**: Built-in delays to prevent rate limiting
- **Status Tracking**: Monitor success/failure of each claim with transaction hashes
- **Bulk Operations**: Generate wallets and claim faucets in a single operation

### 🔄 Token Swapping (Bridge)
- **AEX → WAEX Wrapping**: Automatically wrap native AEX tokens to WAEX (Wrapped AEX)
- **Smart Contract Integration**: Direct interaction with WAEX contract
- **Random Amount Generation**: Configurable min/max swap amounts for natural behavior
- **Balance Validation**: Checks wallet balance before attempting swaps
- **Retry Support**: Re-run swaps for all wallets including previously processed ones

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Blockchain**: ethers.js v6 for Ethereum interactions
- **Network**: AESC Network Testnet (Chain ID: 71602)

## Project Structure

```
backend/
├── config/              # Configuration files
├── controllers/         # Business logic
│   ├── walletController.js        # Wallet generation & management
│   ├── faucetClaimController.js   # Faucet claim automation
│   └── swapJobController.js       # Token swap/wrap operations
├── routes/              # API route definitions
│   ├── walletRoute.js
│   ├── faucetClaimRoutes.js
│   └── swapJobRoutes.js
├── prisma/              # Database schema & migrations
│   ├── schema.prisma              # Database models
│   └── client.js
├── index.js             # Express server entry point
└── .env                 # Environment variables
```

## Database Schema

### Wallet
- Stores wallet addresses and encrypted private keys
- Tracks creation timestamps
- Related to faucet claims and swap jobs

### FaucetClaim
- Tracks faucet claim attempts for each wallet
- Stores status (pending, success, failed, skipped)
- Records transaction hashes and amounts
- Links to parent wallet

### SwapJob
- Monitors AEX → WAEX swap operations
- Tracks token amounts, transaction hashes, and attempts
- Records success/failure status with error messages
- Links to parent wallet

## API Endpoints

### Wallet Endpoints
- `POST /api/wallets/create` - Manually create a wallet
- `POST /api/wallets/generate?count=50` - Generate multiple wallets
- `GET /api/wallets` - List all wallets

### Faucet Endpoints
- `POST /api/faucetclaims/generate-and-claim` - Generate wallets and claim faucets

### Swap Endpoints
- `POST /api/swapjobs/swap-single` - Swap for a single wallet
- `POST /api/swapjobs/swap-all` - Swap for all unclaimed wallets
- `POST /api/swapjobs/swap-left` - Re-run swaps for all wallets (including previously processed)

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/aescswap

# AESC Network
AESC_URL=https://testnetrpc1.aescnet.com
AESC_CHAIN_ID=71602

# Faucet
FAUCET_URL=https://testnet1faucet.aescnet.com/api/faucet/request

# WAEX Contract
WAEX_ADDRESS=0x05BE4146EAc85E380fB71ec6A4b97bA325cd53EE

# Swap Configuration
MIN_SWAP=0.01
MAX_SWAP=0.2
DELAY_MS=10000
```

## Installation

1. **Clone the repository**
   ```bash
   cd "C:\Codings\Aesc Swap\Aesc-Swap\backend"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - Copy `.env.example` to `.env` (if available)
   - Update database connection string and other settings

4. **Set up database**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Start the server**
   ```bash
   npm run dev
   ```

   Server runs on `http://localhost:3000`

## Usage Examples

### Generate 50 Wallets
```bash
curl -X POST http://localhost:3000/api/wallets/generate?count=50
```

### Generate Wallets and Claim Faucets
```bash
curl -X POST http://localhost:3000/api/faucetclaims/generate-and-claim \
  -H "Content-Type: application/json" \
  -d '{"count": 10}'
```

### Run Swaps for All Wallets
```bash
curl -X POST http://localhost:3000/api/swapjobs/swap-all
```

### Re-run Swaps (Including Previously Processed)
```bash
curl -X POST http://localhost:3000/api/swapjobs/swap-left
```

## Features in Detail

### Automated Workflow
1. Generate unlimited Ethereum wallets
2. Automatically claim AEX tokens from testnet faucet
3. Wrap AEX to WAEX using WAEX contract
4. Track all operations in database
5. Retry failed operations

### Safety Features
- Duplicate wallet detection
- Balance validation before swaps
- Error handling and logging
- Transaction confirmation
- Rate limiting protection

### Monitoring
- Real-time console progress updates
- Transaction hash tracking
- Success/failure statistics
- Database audit trail

## Network Information

- **Network**: AESC Network Testnet
- **Chain ID**: 71602
- **RPC URL**: https://testnetrpc1.aescnet.com
- **Faucet URL**: https://testnet1faucet.aescnet.com
- **WAEX Contract**: 0x05BE4146EAc85E380fB71ec6A4b97bA325cd53EE

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Database operations
npx prisma studio        # Open Prisma Studio GUI
npx prisma migrate dev   # Create new migration
npx prisma generate      # Regenerate Prisma Client
```

## License

ISC

## Disclaimer

This project is designed for testnet use only. Never use on mainnet or with real funds. Always keep private keys secure and never commit them to version control.

---

**Co-Authored-By: Warp <agent@warp.dev>**
