import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send("you are in home directory now ")
    console.log("You are in home directory")
})

app.post("/", (req, res) => {

    const { name } = req.body;
    res.json({ message: `Your name is ${name}` })
    console.log("You are in post directory")
})

app.listen(PORT, () => {
    console.log(`You are logged in to ${PORT}`)
})