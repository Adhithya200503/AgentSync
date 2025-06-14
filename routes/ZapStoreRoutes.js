import express from "express";
import { addProduct, createZapStore, deleteProduct, deleteZapStore, getZapStoresByUser, updateProduct, updateZapStore } from "../controller/ZapStoreControllers.js";

const router = express.Router();


router.post("/add-product",addProduct);
router.get("/user",getZapStoresByUser);
router.delete("/products/:productId",deleteProduct);
router.put("/products/:productId",updateProduct);
router.post("/create-zapStore",createZapStore);
router.delete("/stores/delete/:storeId",deleteZapStore);
router.put("/stores/store/update/:storeId",updateZapStore);

export default router;