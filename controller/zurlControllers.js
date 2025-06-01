import QRCode from "qrcode";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import admin, { db } from "../utils/firebase.js";


export const createShortUrl = async (req, res) => {
  const user = req.user;

  const isValidUrl = (url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const { originalUrl, customUrl } = req.body;

  if (!originalUrl || !isValidUrl(originalUrl)) {
    return res.status(400).json({ error: 'Invalid or missing originalUrl' });
  }

  // Determine the ID to use
  const slug = customUrl?.trim() || uuidv4().slice(0, 8); // limit to 8 chars for readability

  const docRef = db.collection('short-links').doc(slug);
  const doc = await docRef.get();

  if (doc.exists) {
    return res.status(409).json({ error: 'Custom URL already in use' });
  }

  const qrCodeDataURL = await QRCode.toDataURL(originalUrl);
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const shortUrl = `${baseUrl}/Zurl/${slug}`;

  const data = {
    shortUrl,
    shortId: slug,
    originalUrl,
    userId: user?.uid || null,
    qrcode: qrCodeDataURL,
    clicks: 0,
    createdAt: new Date().toISOString(),
    customUrl: customUrl || "",
    isActive: true,
  };

  await docRef.set(data);

  return res.status(201).json({ shortId: slug, qrcode: qrCodeDataURL });
};


export const redirectShortUrl = async (req, res) => {
  const { shortId } = req.params;
  if (!shortId) {
    return res.status(400).send("Missing shortId");
  }
  const docRef = db.collection("short-links").doc(shortId);
  const doc = await docRef.get();
  if (!doc.exists) {
    return res.status(404).send("Short link not found");
  }
  const data = doc.data();
  if (!data.isActive) {
    return res.status(410).send("Link is no longer active");
  }

  await docRef.update({
    clicks: admin.firestore.FieldValue.increment(1),
  });


  return res.redirect(data.originalUrl);
};
