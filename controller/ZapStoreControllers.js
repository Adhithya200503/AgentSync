import cloudinary from "../utils/cloudinary.js";
import admin, { db } from "../utils/firebase.js";

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
  const galleryFiles =  req.files?.imageGallery;

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

 
export const signup = async (req, res) => {
  const { email, password, storeId } = req.body;

  try {
    if (!storeId || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const docRef = db.collection("zapStores").doc(storeId);
    const store = await docRef.get();

    if (!store.exists) {
      return res.status(404).json({ error: "Store not found" });
    }

  
    const userRecord = await admin.auth().createUser({ email, password });

   
    await db.collection("storeUsers").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      storeId,
      role: "customer",
      createdAt: new Date()
    });

    res.json({ message: "Signup successful", uid: userRecord.uid });
  } catch (err) {
   
    if (err.code === "auth/email-already-exists") {
      return res.status(400).json({ error: "Email already registered" });
    }

    res.status(500).json({ error: err.message });
  }
};


export const login = async (req, res) => {
  const { email, password, storeId } = req.body;

  if (!email || !password || !storeId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    
    const storeRef = db.collection("zapStores").doc(storeId);
    const storeSnap = await storeRef.get();

    if (!storeSnap.exists) {
      return res.status(404).json({ error: "Store not found" });
    }
 
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
      {
        email,
        password,
        returnSecureToken: true,
      }
    );

    const { idToken, localId: uid } = response.data;

    // Step 3: Check if user is linked to the store
    const userDoc = await db.collection("storeUsers").doc(uid).get();

    if (!userDoc.exists || userDoc.data().storeId !== storeId) {
      return res.status(403).json({ error: "Unauthorized for this store" });
    }

    // Step 4: Return token and user info
    return res.json({
      message: "Login successful",
      token: idToken,
      uid,
      storeId,
      role: userDoc.data().role,
    });
  } catch (err) {
    const errorMsg =
      err?.response?.data?.error?.message === "EMAIL_NOT_FOUND"
        ? "Email not registered"
        : err?.response?.data?.error?.message === "INVALID_PASSWORD"
        ? "Invalid password"
        : err.message;

    return res.status(401).json({ error: errorMsg });
  }
};