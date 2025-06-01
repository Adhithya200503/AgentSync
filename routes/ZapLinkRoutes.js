import { createOrUpdateLinkPage, getLinkPageByUsername } from "../controller/zapLinkControllers.js";
import express from "express"
const router = express.Router();

router.post('/link-page',createOrUpdateLinkPage);



export default router;