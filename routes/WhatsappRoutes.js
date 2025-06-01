import express from "express";
import { addAgentToLink, createLink ,deleteAgentFromLink,getAgentsFromLink,getLinkData, toggleMultiAgentSupport  } from "../controller/whatsappLinkController.js";
const router = express.Router();

router.post("/create", createLink);
router.post("/add-agent",addAgentToLink);
router.get("/url-data/:code", getLinkData);
router.delete("/delete-agent",deleteAgentFromLink);
router.patch("/update-multi-agent", toggleMultiAgentSupport);
router.get('/agents',getAgentsFromLink);
export default router;
