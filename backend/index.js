import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import walletRoutes from "./routes/walletRoute.js";
import faucetClaimRoutes from "./routes/faucetClaimRoutes.js";
import swapJobRoutes from "./routes/swapJobRoutes.js";
import bridgeRoutes from "./routes/bridgeRoutes.js"
import automationRoutes from "./routes/automationRoutes.js"
import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";
import cron from "node-cron";
import { executeAutomation } from "./controllers/automationController.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ─── Cron Job: Run automation every 10 minutes ───────
cron.schedule("*/10 * * * *", async () => {
    console.log("\n⏰ Cron triggered: Running automation...");
    const count = parseInt(process.env.CRON_WALLETS_COUNT || "100");
    await executeAutomation(count);
});

app.get("/", (req, res) => {
    res.send({ message: "you are in wallet directory now" })
})

//temporary proxy setup

app.get("/test-proxy", async (req, res) => {
    try {

        const randomProxy = "http://7253ea78ce8d8ebc90c5__cr.in:7fd6ee2ed6cd8a06@gw.dataimpulse.com:823";
        const agent = new HttpsProxyAgent(randomProxy);

        const response = await axios.get("https://api.ipify.org/", {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 10000,
        });

        res.json({
            working: true,
            proxyUsed: randomProxy,
            ip: response.data,
            data: response.data
        });
    } catch (err) {
        res.json({ working: false, error: err.message });
    }
});

app.use("/api/wallets", walletRoutes);
app.use("/api/faucetclaims", faucetClaimRoutes);
app.use("/api/swapjobs", swapJobRoutes);
app.use("/api/bridges", bridgeRoutes);
app.use("/api/automation", automationRoutes)

app.listen(PORT, () => {
    console.log(`You are logged in to ${PORT}`)
})
