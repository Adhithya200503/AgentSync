import express from "express";
import { generateAIBio } from "../controller/AIControllers.js";

const router = express.Router();

router.post("/generate-bio", generateAIBio);


export default router