import express from "express"
import { createPortFolio, editPortFolio } from "../controller/skillVaultController.js";
const router = express.Router();

router.post('/create-portfolio',createPortFolio);
router.patch('/portfolio/:id',editPortFolio);

export default router;