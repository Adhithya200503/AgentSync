import express from "express";
import { createShortUrl} from "../controller/zurlControllers.js";
import { getAllUserZapLinks } from "../controller/zapLinkControllers.js";
const router = express.Router();
router.post("/create-short-url",createShortUrl);
router.get("/get-user-zaplinks",getAllUserZapLinks);
export default router;
