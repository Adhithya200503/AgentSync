import express from "express";
import { createShortUrl} from "../controller/zurlControllers.js";
const router = express.Router();
router.post("/create-short-url",createShortUrl);
export default router;
