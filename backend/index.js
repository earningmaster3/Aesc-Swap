import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import walletRoutes from "./routes/walletRoute.js";
import faucetClaimRoutes from "./routes/faucetClaimRoutes.js";
import swapJobRoutes from "./routes/swapJobRoutes.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send({ message: "you are in wallet directory now" })
})

app.use("/api/wallets", walletRoutes);
app.use("/api/faucetclaims", faucetClaimRoutes);
app.use("/api/swapjobs", swapJobRoutes);

app.listen(PORT, () => {
    console.log(`You are logged in to ${PORT}`)
})
