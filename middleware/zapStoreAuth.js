import admin, { db } from "../utils/firebase.js";


const verifyAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const idToken = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

   
    const userDoc = await db.collection("storeUsers").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(403).json({ error: "User not found in storeUsers" });
    }

    req.user = {
      uid,
      email: decodedToken.email,
      storeId: userDoc.data().storeId,
      role: userDoc.data().role,
    };

    next(); 
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export default verifyAuth