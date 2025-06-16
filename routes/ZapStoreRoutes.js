import express from "express";
import { addProduct, createZapStore, deleteProduct, deleteZapStore, getZapStoresByUser, login, signup, updateProduct, updateZapStore } from "../controller/ZapStoreControllers.js";
import authenticateToken from "../middleware/authenticateToken.js";
import verifyAuth from "../middleware/zapStoreAuth.js";

const router = express.Router();


router.post("/add-product", authenticateToken, addProduct);
router.get("/user", authenticateToken, getZapStoresByUser);
router.delete("/products/:productId", authenticateToken, deleteProduct);
router.put("/products/:productId", authenticateToken, updateProduct);
router.post("/create-zapStore", authenticateToken, createZapStore);
router.delete("/stores/delete/:storeId", authenticateToken, deleteZapStore);
router.put("/stores/store/update/:storeId", authenticateToken, updateZapStore);

router.post("/login",login);
router.post("/signup",signup);

router.get("/catlog",verifyAuth,(req,res)=>{
    return res.json({message:"verified"})
})

export default router;