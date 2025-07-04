import express from "express";
import { createShortUrl, createShortUrlWithUidParam} from "../controller/zurlControllers.js";
import { getAllUserZapLinks } from "../controller/zapLinkControllers.js";
const router = express.Router();
router.post("/create-short-url",createShortUrl);
router.post("/create-short-url/:uid",createShortUrlWithUidParam)
router.get("/get-user-zaplinks",getAllUserZapLinks);
export default router;
