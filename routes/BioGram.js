import express from "express"
import { createPortFolio } from "../controller/skillVaultController.js";
const router = express.Router();

router.post('/create-portfolio',createPortFolio);



export default router;