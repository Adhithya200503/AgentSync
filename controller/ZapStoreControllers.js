import cloudinary from "../utils/cloudinary.js";
import { db } from "../utils/firebase.js";



export const addProduct = async (req, res) => {
  const userId = req.user?.user_id;
  const { name, description, price, category , storeId } = req.body;
  const image = req.files?.image;

  if (!name || !description || !price || !category || !image || !storeId) {
    return res.status(400).json({ error: "All fields including image must be filled" });
  }

  try {
    const result = await cloudinary.uploader.upload(image.tempFilePath, {
      folder: `products/${userId}`,
    });

    const product = {
      name,
      description,
      price: parseFloat(price),
      imageUrl: result.secure_url,
      imageId: result.public_id,
      userId,
      category,
      storeId,
      createdAt: new Date(),
    };

    const docRef = await db.collection("zapProducts").add(product);
    await docRef.update({ productId: docRef.id });

    res.status(200).json({ productId: docRef.id, message: "Product added successfully" });

  } catch (error) {
    console.error("Error adding product:", error);
    res.status(500).json({ error: "Failed to add product", details: error.message });
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

    await docRef.delete();

    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({ error: "Failed to delete product", details: error.message });
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
  const { name, description, price, category } = req.body;

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
    updates.updatedAt = new Date();

    await docRef.update(updates);

    return res.status(200).json({ message: "Product updated successfully", updates });
  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(500).json({ error: "Failed to update product", details: error.message });
  }
};

 
const ALLOWED_CATEGORIES = [
  "Home Goods",
  "Personal Care",
  "Merchandise Apparel & Accessories",
  "Electronic Peripherals",
  "Gifts & Novelties"
];

export const createZapStore = async (req, res) => {
  const userId = req.user?.user_id;
  const { storeName, bio, address, category } = req.body;
  const logo = req.files?.logo;

  if (!storeName || !bio || !address || !category) {
    return res.status(400).json({ error: "All fields including category are required" });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid store category" });
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

    const storeData = {
      storeName,
      bio,
      address: JSON.parse(address),
      category,
      logoUrl,
      logoId,
      userId,
      createdAt: new Date(),
    };

    const docRef = await db.collection("zapStores").add(storeData);
    await docRef.update({ storeId: docRef.id });

    res.status(201).json({ message: "Store created successfully", storeId: docRef.id });

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