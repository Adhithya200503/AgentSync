import express from "express"
import authenticateToken from "./middleware/authenticateToken.js"
import WhatsAppLinkRoutes from "./routes/WhatsappRoutes.js"
import cors from "cors"
import dotenv from "dotenv"
import { redirectLink } from "./controller/whatsappLinkController.js"
import ZurlRoutes from "./routes/zurlRoutes.js"
import { session } from "telegraf";
import { redirectShortUrl } from "./controller/zurlControllers.js";
import ZapLinkRoutes from "./routes/ZapLinkRoutes.js"
import { getLinkPageByUsername } from "./controller/zapLinkControllers.js";
import BioGramRoutes from "./routes/BioGram.js"
import { getPortfolio } from "./controller/skillVaultController.js"
dotenv.config();
const app = express();
app.use(express.json())

app.use(cors({
  origin: ['http://localhost:5173', 'https://d98b-27-5-87-159.ngrok-free.app','https://agentsync-5ab53.web.app'],
  methods: ['GET', 'POST', 'DELETE', 'PATCH','PUT'],
  credentials: true
}));
const PORT = process.env.PORT || 3000;
app.get("/", authenticateToken, (req, res) => {
  return res.json({ message: "hello world" })
})
app.get("/portfolio/:portfolioId", getPortfolio);
app.put("/portfolio/:portfolioId", getPortfolio);
app.get("/Zurl/:shortId",redirectShortUrl);
app.get('/link-page/:username', getLinkPageByUsername);
app.get("/:code", redirectLink);
app.use("/whatsapp", authenticateToken, WhatsAppLinkRoutes)
app.use("/zurl", authenticateToken ,  ZurlRoutes);
app.use("/zapLink",authenticateToken,ZapLinkRoutes);
app.use("/bio-gram",authenticateToken,BioGramRoutes)

app.listen(3000, () => console.log(`server running successfully on port ${PORT} `))