import prisma from "../prisma/client.js";
import { ethers } from "ethers";


export const createWallet = async (req, res) => {


    try {
        const { address, privateKey } = req.body;

        const existWallet = await prisma.wallet.findUnique({
            where: {
                address: address,
            }
        })

        console.log("wallet already exists", existWallet)

        if (existWallet) {

            return res.status(400).json({ error: "Wallet or private key already exists" });
        }

        const wallet = await prisma.wallet.create({
            data: {
                address,
                privateKey,
            },
        });
        console.log(wallet);
        res.json({ message: "Wallet created successfully", wallet });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to create wallet" });
    }
}

// automatically create wallet

export const generateWallets = async (req, res) => {
    try {
        const count = parseInt(req.query.count || req.body.count || 5);

        if (isNaN(count) || count < 1 || count > 1000) {
            return res.status(400).json({ error: "Count must be between 1 and 1000" })
        }

        console.log(`generating ${count} wallets`);

        const results = { created: 0, skipped: 0, wallets: [] };

        for (let i = 0; i < count; i++) {
            //generate random wallets using ethers
            const randomWallet = ethers.Wallet.createRandom();

            //check if wallet is already exists
            const existWallet = await prisma.wallet.findFirst({
                where: {
                    OR: [
                        { address: randomWallet.address },
                        { privateKey: randomWallet.privateKey }
                    ]
                }
            })

            if (existWallet) {
                results.skipped++;
                continue;
            }


            //SAVE wallets to database
            const wallet = await prisma.wallet.create({
                data: {
                    address: randomWallet.address,
                    privateKey: randomWallet.privateKey,
                },
            });

            results.created++;

            //push wallet to array
            results.wallets.push({
                id: wallet.id,
                address: wallet.address,
                privateKey: wallet.privateKey,
            })

            //show progress
            if ((i + 1) % 10 === 0) {
                console.log(`  ✅ ${i + 1}/${count} wallets generated`);
            }
        }

        console.log(`🎉 Done! Created: ${results.created} | Skipped: ${results.skipped}`);
        res.json({
            message: `Successfully generated ${results.created} wallets`,
            created: results.created,
            skipped: results.skipped,
            wallets: results.wallets,
        });


    }
    catch (error) {
        console.log(error);
        res.status(500).json({ error: "Failed to create wallet" })


    }
}

//show all wallets

export const getAllWallets = async (req, res) => {
    try {
        const wallets = await prisma.wallet.findMany({
            select: {
                id: true,
                address: true,
                createdAt: true,
            },
            orderBy: { id: 'asc' }
        });

        res.json({ total: wallets.length, wallets });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
};