
import express from "express";
import verifyAuth from "../middleware/zapStoreAuth.js";
import { addProduct, addToCart, clearCart, createZapStore, deleteProduct, deleteUserAccount, deleteZapStore, getCart, getProduct, getProductsByStoreId, getZapStoresByUser, login, removeCartItem, signup, updateCartItemQuantity, updateProduct, updateZapStore } from "../controller/ZapStoreControllers.js";
import authenticateToken from "../middleware/authenticateToken.js";


const router = express.Router();


router.post("/add-product", authenticateToken, addProduct);
router.delete("/products/:productId", authenticateToken, deleteProduct);
router.put("/products/:productId", authenticateToken, updateProduct);
router.get("/products/:productId", getProduct); 
router.get("/stores/:storeId/products", getProductsByStoreId);

router.post("/create-zapStore", authenticateToken, createZapStore);
router.delete("/stores/delete/:storeId", authenticateToken, deleteZapStore);
router.put("/stores/store/update/:storeId", authenticateToken, updateZapStore);
router.get("/user", authenticateToken, getZapStoresByUser);

router.post("/login", login);
router.post("/signup", signup);


router.get("/catlog", verifyAuth , (req, res) => { 
  return res.json({ message: "verified" });
});

router.post("/cart/add", verifyAuth, addToCart);
router.get("/cart", verifyAuth, getCart); 
router.put("/cart/:productId", verifyAuth, updateCartItemQuantity); 
router.delete("/cart/:productId", verifyAuth, removeCartItem); 
router.delete("/cart/clear", verifyAuth, clearCart); 
router.delete("/user/delete-account",verifyAuth,deleteUserAccount);


export default router;