import axios from "axios";
import cloudinary from "../utils/cloudinary.js";
import admin, { db } from "../utils/firebase.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";


const ALLOWED_CATEGORIES = [
  "Home Goods",
  "Personal Care",
  "Merchandise Apparel & Accessories",
  "Electronic Peripherals",
  "Gifts & Novelties"
];

export const addProduct = async (req, res) => {
  const userId = req.user?.user_id;
  const {
    name,
    description,
    price,
    category,
    stock = 0,
    discountPercentage = 0,
    storeId,
    flashSale = false,
  } = req.body;

  const image = req.files?.image;
  const galleryFiles = req.files?.imageGallery;

  if (!name || !description || !price || !category || !image || !storeId) {
    return res.status(400).json({ error: "All required fields including image must be filled" });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid product category" });
  }

  try {

    const result = await cloudinary.uploader.upload(image.tempFilePath, {
      folder: `products/${userId}`,
    });


    let uploadedGallery = [];

    if (galleryFiles) {
      const filesArray = Array.isArray(galleryFiles) ? galleryFiles : [galleryFiles];

      if (filesArray.length > 3) {
        return res.status(400).json({ error: "Maximum 3 gallery images allowed" });
      }

      for (const file of filesArray) {
        const uploadRes = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: `products/${userId}/gallery`,
        });
        uploadedGallery.push({
          url: uploadRes.secure_url,
          public_id: uploadRes.public_id,
        });
      }
    }


    let product = {
      name,
      description,
      price: parseFloat(price),
      imageUrl: result.secure_url,
      imageId: result.public_id,
      userId,
      category,
      stock: parseInt(stock),
      discountPercentage: parseFloat(discountPercentage),
      imageGallery: uploadedGallery,
      storeId,
      flashSale: flashSale === 'true' || flashSale === true,
      createdAt: admin.firestore.Timestamp.now(),
    };

    const docRef = await db.collection("zapProducts").add(product);
    await docRef.update({ productId: docRef.id });

    product = { ...product, productId: docRef.id };

    return res.status(200).json({
      message: "Product added successfully",
      productId: docRef.id,
      product,
    });

  } catch (error) {
    console.error("Error adding product:", error);
    return res.status(500).json({
      error: "Failed to add product",
      details: error.message,
    });
  }
};



export const deleteProduct = async (req, res) => {
  const { productId } = req.params;
  const userId = req.user?.user_id;

  if (!productId) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  try {
    const docRef = db.collection("zapProducts").doc(productId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = doc.data();

    if (product.userId !== userId) {
      return res.status(403).json({ error: "You are not authorized to delete this product" });
    }


    if (product.imageId) {
      await cloudinary.uploader.destroy(product.imageId);
    }


    if (Array.isArray(product.imageGallery)) {
      for (const img of product.imageGallery) {
        if (img.public_id) {
          await cloudinary.uploader.destroy(img.public_id);
        }
      }
    }

    await docRef.delete();

    return res.status(200).json({ message: "Product deleted successfully" });

  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({
      error: "Failed to delete product",
      details: error.message,
    });
  }
};


export const getProduct = async (req, res) => {
  const { productId } = req.params;

  if (!productId) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  try {
    const docRef = db.collection("zapProducts").doc(productId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.status(200).json({ product: { productId, ...doc.data() } });
  } catch (error) {
    console.error("Error getting product:", error);
    return res.status(500).json({ error: "Failed to fetch product", details: error.message });
  }
};



export const updateProduct = async (req, res) => {
  const { productId } = req.params;
  const userId = req.user?.user_id;

  const {
    name,
    description,
    price,
    category,
    stock,
    discountPercentage,
    flashSale,
  } = req.body;

  const image = req.files?.image;
  const newGalleryFiles = req.files?.imageGallery;

  if (!productId) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  try {
    const docRef = db.collection("zapProducts").doc(productId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = doc.data();

    if (product.userId !== userId) {
      return res.status(403).json({ error: "You are not authorized to update this product" });
    }

    const updates = {};

    if (name) updates.name = name;
    if (description) updates.description = description;
    if (price) updates.price = parseFloat(price);
    if (category) updates.category = category;
    if (stock !== undefined) updates.stock = parseInt(stock);
    if (discountPercentage !== undefined) updates.discountPercentage = parseFloat(discountPercentage);
    if (flashSale !== undefined) updates.flashSale = flashSale === "true" || flashSale === true;

    // === HANDLE MAIN IMAGE UPDATE ===
    if (image) {
      try {
        if (product.imageId) {
          await cloudinary.uploader.destroy(product.imageId);
        }

        const uploadResult = await cloudinary.uploader.upload(image.tempFilePath, {
          folder: `products/${userId}`,
        });

        updates.imageUrl = uploadResult.secure_url;
        updates.imageId = uploadResult.public_id;
      } catch (uploadError) {
        return res.status(500).json({ error: "Main image upload failed", details: uploadError.message });
      }
    }

    // === HANDLE GALLERY IMAGE UPDATE ===
    if (newGalleryFiles) {
      try {
        const filesArray = Array.isArray(newGalleryFiles)
          ? newGalleryFiles
          : [newGalleryFiles];

        if (filesArray.length > 3) {
          return res.status(400).json({ error: "Max 3 gallery images allowed" });
        }

        // Delete existing gallery images
        if (Array.isArray(product.imageGallery)) {
          for (const img of product.imageGallery) {
            if (img.public_id) {
              await cloudinary.uploader.destroy(img.public_id);
            }
          }
        }

        const uploadedGallery = [];

        for (const file of filesArray) {
          const uploadRes = await cloudinary.uploader.upload(file.tempFilePath, {
            folder: `products/${userId}/gallery`,
          });

          uploadedGallery.push({
            url: uploadRes.secure_url,
            public_id: uploadRes.public_id,
          });
        }

        updates.imageGallery = uploadedGallery;
      } catch (galleryError) {
        return res.status(500).json({ error: "Gallery image upload failed", details: galleryError.message });
      }
    }

    updates.updatedAt = admin.firestore.Timestamp.now();

    await docRef.update(updates);

    return res.status(200).json({ message: "Product updated successfully", updates });

  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({ error: "Failed to update product", details: error.message });
  }
};



export const createZapStore = async (req, res) => {
  const userId = req.user?.user_id;
  const { storeName, bio, address } = req.body;
  const logo = req.files?.logo;

  if (!storeName || !bio || !address) {
    return res.status(400).json({ error: "All fields including category are required" });
  }
  try {
    let logoUrl = "";
    let logoId = "";

    if (logo) {
      const result = await cloudinary.uploader.upload(logo.tempFilePath, {
        folder: `zapstores/${userId}`,
      });
      logoUrl = result.secure_url;
      logoId = result.public_id;
    }

    let storeData = {
      storeName,
      bio,
      address: JSON.parse(address),
      logoUrl,
      logoId,
      userId,
      createdAt: new Date(),
    };

    const docRef = await db.collection("zapStores").add(storeData);
    await docRef.update({ storeId: docRef.id });
    storeData = { ...storeData, storeId: docRef.id };
    res.status(201).json({ message: "Store created successfully", storeData });

  } catch (error) {
    console.error("Error creating store:", error);
    res.status(500).json({ error: "Failed to create store", details: error.message });
  }
};

export const deleteZapStore = async (req, res) => {
  const userId = req.user?.user_id;
  const { storeId } = req.params;

  if (!storeId) {
    return res.status(400).json({ error: "Store ID is required" });
  }

  try {
    const docRef = db.collection("zapStores").doc(storeId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Store not found" });
    }

    const store = doc.data();
    if (store.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized to delete this store" });
    }

    // Delete logo from Cloudinary if exists
    if (store.logoId) {
      await cloudinary.uploader.destroy(store.logoId);
    }


    await docRef.delete();

    res.json({ message: "Store deleted successfully" });

  } catch (error) {
    console.error("Error deleting store:", error);
    res.status(500).json({ error: "Failed to delete store", details: error.message });
  }
};


export const updateZapStore = async (req, res) => {
  const userId = req.user?.user_id;
  const { storeId } = req.params;
  const { storeName, bio, address, category } = req.body;
  const logo = req.files?.logo;

  if (!storeName || !bio || !address || !category) {
    return res.status(400).json({ error: "All fields including category are required" });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid store category" });
  }

  try {
    const docRef = db.collection("zapStores").doc(storeId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Store not found" });
    }

    const store = doc.data();
    if (store.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized to update this store" });
    }

    let logoUrl = store.logoUrl;
    let logoId = store.logoId;

    // Replace logo if new one is uploaded
    if (logo) {
      // Delete old logo from Cloudinary
      if (logoId) {
        await cloudinary.uploader.destroy(logoId);
      }

      // Upload new logo
      const result = await cloudinary.uploader.upload(logo.tempFilePath, {
        folder: `zapstores/${userId}`,
      });
      logoUrl = result.secure_url;
      logoId = result.public_id;
    }

    await docRef.update({
      storeName,
      bio,
      address: JSON.parse(address),
      category,
      logoUrl,
      logoId,
      updatedAt: new Date(),
    });

    res.json({ message: "Store updated successfully" });

  } catch (error) {
    console.error("Error updating store:", error);
    res.status(500).json({ error: "Failed to update store", details: error.message });
  }
};

export const getZapStoreById = async (req, res) => {
  const { storeId } = req.params;

  if (!storeId) {
    return res.status(400).json({ error: "Store ID is required" });
  }

  try {
    const docRef = db.collection("zapStores").doc(storeId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Store not found" });
    }

    res.json({ store: doc.data() });

  } catch (error) {
    console.error("Error fetching store:", error);
    res.status(500).json({ error: "Failed to fetch store", details: error.message });
  }
};

export const getZapStoresByUser = async (req, res) => {
  const userId = req.user?.user_id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID missing" });
  }

  try {
    const snapshot = await db
      .collection("zapStores")
      .where("userId", "==", userId)
      .get();

    const stores = snapshot.docs.map(doc => ({
      storeId: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ stores });

  } catch (error) {
    console.error("Error fetching user's stores:", error);
    res.status(500).json({ error: "Failed to fetch stores", details: error.message });
  }
};


export const getProductsByStoreId = async (req, res) => {
  const { storeId } = req.params;

  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  try {
    const snapshot = await db
      .collection("zapProducts")
      .where("storeId", "==", storeId)
      .get();

    const products = snapshot.docs.map(doc => ({
      productId: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ products });

  } catch (error) {
    console.error("Error fetching store products:", error);
    res.status(500).json({ error: "Failed to fetch products", details: error.message });
  }
};


const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";

export const signup = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const existingSnap = await db.collection("storeUsers").where("email", "==", email).get();

    if (!existingSnap.empty) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userDoc = await db.collection("storeUsers").add({
      email,
      password: hashedPassword,
      createdAt: new Date(),
    });

    const token = jwt.sign({ uid: userDoc.id, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ message: "Signup successful", uid: userDoc.id, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    const snap = await db.collection("storeUsers").where("email", "==", email).get();

    if (snap.empty) {
      return res.status(401).json({ error: "Email not registered" });
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    const isMatch = await bcrypt.compare(password, userData.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = jwt.sign({ uid: userDoc.id, email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ message: "Login successful", uid: userDoc.id, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


export const deleteUserAccount = async (req, res) => {
  const userId = req.user?.uid;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID missing" });
  }

  try {
    const productsSnapshot = await db.collection("zapProducts").where("userId", "==", userId).get();
    const productDeleteBatch = db.batch();

    for (const doc of productsSnapshot.docs) {
      const product = doc.data();
      if (product.imageId) {
        await cloudinary.uploader.destroy(product.imageId);
      }
      if (Array.isArray(product.imageGallery)) {
        for (const img of product.imageGallery) {
          if (img.public_id) {
            await cloudinary.uploader.destroy(img.public_id);
          }
        }
      }
      productDeleteBatch.delete(doc.ref);
    }
    await productDeleteBatch.commit();

    const storesSnapshot = await db.collection("zapStores").where("userId", "==", userId).get();
    const storeDeleteBatch = db.batch();

    for (const doc of storesSnapshot.docs) {
      const store = doc.data();
      if (store.logoId) {
        await cloudinary.uploader.destroy(store.logoId);
      }
      storeDeleteBatch.delete(doc.ref);
    }
    await storeDeleteBatch.commit();

    const cartItemsRef = db.collection("carts").doc(userId).collection("items");
    const cartItemsSnapshot = await cartItemsRef.get();
    const cartBatch = db.batch();

    if (!cartItemsSnapshot.empty) {
      cartItemsSnapshot.docs.forEach(doc => {
        cartBatch.delete(doc.ref);
      });
      await cartBatch.commit();
    }
    await db.collection("carts").doc(userId).delete();

    await db.collection("storeUsers").doc(userId).delete();

    return res.status(200).json({ message: "Account and all associated data deleted successfully." });

  } catch (error) {
    console.error("Error deleting user account and associated data:", error);
    return res.status(500).json({
      error: "Failed to delete account and associated data",
      details: error.message,
    });
  }
};


export const addToCart = async (req, res) => {
  const userId = req.user?.uid; // Changed from req.user?.user_id to req.user?.uid
  const { productId, quantity = 1 } = req.body;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID missing" });
  }

  if (!productId || typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({ error: "Product ID and a valid quantity (greater than 0) are required" });
  }

  try {
    // Check if the product exists
    const productDoc = await db.collection("zapProducts").doc(productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: "Product not found" });
    }

    const cartRef = db.collection("carts").doc(userId); // Cart document for the user
    const cartItemRef = cartRef.collection("items").doc(productId); // Specific product in cart

    const cartItem = await cartItemRef.get();

    if (cartItem.exists) {
      // If item already in cart, update quantity
      await cartItemRef.update({
        quantity: admin.firestore.FieldValue.increment(quantity),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return res.status(200).json({ message: "Product quantity updated in cart" });
    } else {
      // If item not in cart, add new item
      await cartItemRef.set({
        productId,
        quantity,
        addedAt: admin.firestore.Timestamp.now(),
      });
      return res.status(201).json({ message: "Product added to cart successfully" });
    }
  } catch (error) {
    console.error("Error adding to cart:", error);
    return res.status(500).json({ error: "Failed to add product to cart", details: error.message });
  }
};

export const getCart = async (req, res) => {
  const userId = req.user?.uid; 

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID missing" });
  }

  try {
    const cartItemsSnapshot = await db.collection("carts").doc(userId).collection("items").get();

    const cartItems = [];
    for (const doc of cartItemsSnapshot.docs) {
      const cartItemData = doc.data();
      const productId = cartItemData.productId;

      // Fetch product details for each item in the cart
      const productDoc = await db.collection("zapProducts").doc(productId).get();
      if (productDoc.exists) {
        cartItems.push({
          cartItemId: doc.id, 
          quantity: cartItemData.quantity,
          product: { productId, ...productDoc.data() }, 
        });
      } else {
        console.warn(`Product with ID ${productId} not found for user ${userId}'s cart.`);
       
      }
    }

    return res.status(200).json({ cart: cartItems });
  } catch (error) {
    console.error("Error fetching cart:", error);
    return res.status(500).json({ error: "Failed to fetch cart", details: error.message });
  }
};

export const updateCartItemQuantity = async (req, res) => {
  const userId = req.user?.uid; 
  const { productId } = req.params; 
  const { quantity } = req.body;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID missing" });
  }

  if (!productId || typeof quantity !== 'number' || quantity < 0) {
    return res.status(400).json({ error: "Product ID and a valid quantity (0 or greater) are required" });
  }

  try {
    const cartItemRef = db.collection("carts").doc(userId).collection("items").doc(productId);
    const cartItem = await cartItemRef.get();

    if (!cartItem.exists) {
      return res.status(404).json({ error: "Product not found in cart" });
    }

    if (quantity === 0) {
      
      await cartItemRef.delete();
      return res.status(200).json({ message: "Product removed from cart successfully" });
    } else {
      
      await cartItemRef.update({
        quantity,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return res.status(200).json({ message: "Cart item quantity updated successfully" });
    }
  } catch (error) {
    console.error("Error updating cart item quantity:", error);
    return res.status(500).json({ error: "Failed to update cart item quantity", details: error.message });
  }
};

export const removeCartItem = async (req, res) => {
  const userId = req.user?.uid; 
  const { productId } = req.params; 

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID missing" });
  }

  if (!productId) {
    return res.status(400).json({ error: "Product ID is required" });
  }

  try {
    const cartItemRef = db.collection("carts").doc(userId).collection("items").doc(productId);
    const cartItem = await cartItemRef.get();

    if (!cartItem.exists) {
      return res.status(404).json({ error: "Product not found in cart" });
    }

    await cartItemRef.delete();
    return res.status(200).json({ message: "Product removed from cart successfully" });
  } catch (error) {
    console.error("Error removing cart item:", error);
    return res.status(500).json({ error: "Failed to remove product from cart", details: error.message });
  }
};

export const clearCart = async (req, res) => {
  const userId = req.user?.uid; 

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: User ID missing" });
  }

  try {
    const cartItemsSnapshot = await db.collection("carts").doc(userId).collection("items").get();

    const batch = db.batch();
    cartItemsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return res.status(200).json({ message: "Cart cleared successfully" });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return res.status(500).json({ error: "Failed to clear cart", details: error.message });
  }
};



