import prisma from "../prisma/client.js";
import ether
//maunaly create wallet

export const createWallet = async (req, res) => {


    try {
        const { address, privateKey } = req.body;

        const existWallet = await prisma.wallet.findUnique({
            where: {
                address: address,
                privateKey: privateKey
            }
        })

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

// // automatically create wallet

// export const generateWallets = async(req,res)=>{
//  try{
//     const count = parseInt(req.query.count || req.body.count || 5);

//     if(count>1000){
//         return res.status(400).json({error:"Count should be less than 1000"})
//     }

//     console.log(`generating ${count} wallets`);

//     const results = {created:0, skipped:0, wallets:[]};

//     for (i=0, i<count, i++){
//         //generate random wallets using ethers

        
//     }


//  }
//  catch(error){
//     console.log(error);
//     res.status(500).json({error:"Failed to create wallet"})
//  }
// }