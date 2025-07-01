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
import { createOrUpdateTemplate, getLinkPageByUsername, getLinkPageByUsernameWithoutStats, getTemplateById } from "./controller/zapLinkControllers.js";
import BioGramRoutes from "./routes/BioGram.js"
import { getPortfolio } from "./controller/skillVaultController.js"
import aiRoutes from "./routes/AIRoutes.js"
import fileUpload from 'express-fileupload';
import cookieParser from "cookie-parser"
dotenv.config();

const app = express();
app.set("trust proxy", 1);
app.use(cors({
  origin: ['http://localhost:5173', 'https://agentsync-5ab53.web.app', 'https://biograms.web.app', 'https://zapstore-in.web.app'],
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT'],
  credentials: true
}));

app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 50 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: '/tmp/',
}));
app.use(express.json());

app.use(cookieParser());
const PORT = process.env.PORT || 3000;
app.get("/", authenticateToken, (req, res) => {
  return res.json({ message: "hello world" })
})
app.get("/portfolio/:portfolioId", getPortfolio);
app.get("/Zurl/:shortId", redirectShortUrl);
app.get('/link-page/:username', getLinkPageByUsername);
app.get('/zaplink/:username/view-only', getLinkPageByUsernameWithoutStats);
app.use("/whatsapp", authenticateToken, WhatsAppLinkRoutes)
app.use("/zurl", authenticateToken, ZurlRoutes);
app.use("/zapLink", authenticateToken, ZapLinkRoutes);
app.use("/bio-gram", authenticateToken, BioGramRoutes)
app.use("/ai", authenticateToken, aiRoutes);
app.get("/:code", redirectLink);
app.get("/zap-link/template/:templateId",getTemplateById);
app.get("/biogram/:shortId", redirectShortUrl);
app.listen(3000, () => console.log(`server running successfully on port ${PORT} `))