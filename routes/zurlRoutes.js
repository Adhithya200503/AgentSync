import express from "express";
import { createShortUrl, createShortUrlWithUidParam} from "../controller/zurlControllers.js";
import { getAllUserZapLinks } from "../controller/zapLinkControllers.js";
import authenticateToken from "../middleware/authenticateToken.js";
const router = express.Router();
router.post("/create-short-url",authenticateToken,createShortUrl);
router.post("/create-short-url/:uid",createShortUrlWithUidParam)
router.get("/get-user-zaplinks",authenticateToken,getAllUserZapLinks);
export default router;
