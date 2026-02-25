import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import walletRoutes from "./routes/walletRoute.js";
import faucetClaimRoutes from "./routes/faucetClaimRoutes.js";
import swapJobRoutes from "./routes/swapJobRoutes.js";

import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proxyPath = path.join(__dirname, "../proxy.txt");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send({ message: "you are in wallet directory now" })
})

//temporary proxy setup

app.get("/test-proxy", async (req, res) => {
    try {
        const data = fs.readFileSync(proxyPath, "utf8");
        const proxies = data.split("\n").map(p => p.trim()).filter(p => p);

        if (proxies.length === 0) {
            return res.status(500).json({ error: "No proxies found in proxy.txt" });
        }

        const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
        const agent = new HttpsProxyAgent(randomProxy);

        const response = await axios.get("https://ipinfo.io/json", {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 10000,
        });

        res.json({
            working: true,
            proxyUsed: randomProxy,
            ip: response.data.ip,
            data: response.data
        });
    } catch (err) {
        res.json({ working: false, error: err.message });
    }
});

app.use("/api/wallets", walletRoutes);
app.use("/api/faucetclaims", faucetClaimRoutes);
app.use("/api/swapjobs", swapJobRoutes);

app.listen(PORT, () => {
    console.log(`You are logged in to ${PORT}`)
})
