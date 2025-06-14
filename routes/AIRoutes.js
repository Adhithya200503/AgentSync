import express from "express";
import { generateAIBio, generatePost } from "../controller/AIControllers.js";

const router = express.Router();

router.post("/generate-bio", generateAIBio);
router.post("/generate-post",generatePost);
export default router