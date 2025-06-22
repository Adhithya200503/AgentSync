import {  createZapLink, getLinkPageByUsername, getUserZaplinks } from "../controller/zapLinkControllers.js";
import express from "express"
const router = express.Router();

router.post('/link-page',createZapLink);
router.get("/get-user-zaplinks",getUserZaplinks);


export default router;