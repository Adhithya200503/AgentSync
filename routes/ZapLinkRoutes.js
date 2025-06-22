import {  createZapLink, getLinkPageByUsername } from "../controller/zapLinkControllers.js";
import express from "express"
const router = express.Router();

router.post('/link-page',createZapLink);



export default router;