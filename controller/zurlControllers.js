import QRCode from "qrcode";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import admin, { db } from "../utils/firebase.js";
import {UAParser} from "ua-parser-js"; 
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

  const { originalUrl, customUrl, protected: isProtected } = req.body; // Destructure 'protected' as 'isProtected' to avoid conflict

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
    protected: isProtected || false, // Store the protected status
    unLockId: isProtected ? uuidv4() : null // Only generate unLockId if protected
  };

  await docRef.set(data);

  return res.status(201).json({
    shortId: slug,
    qrcode: qrCodeDataURL,
    unLockId: isProtected ? data.unLockId : undefined // Only return unLockId if protected
  });
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

  if (data.protected) {
    const baseUrl = "https://agentsync-5ab53.web.app/zurl";
    return res.redirect(`${baseUrl}/unlock/${shortId}`);
  }

  // Get IP address
  let ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "";

  // Geo info
  const geoRes = await fetch(`https://ipwho.is/${ip}`);
  const geoData = await geoRes.json();
  const country = geoData.success ? geoData.country : "Unknown";
  const city = geoData.success ? geoData.city : "Unknown";

  // Device/browser info
  const parser = new UAParser(req.headers["user-agent"]);
  const browserName = parser.getBrowser().name || "Unknown";
  const deviceType = parser.getDevice().type || "desktop";  
  const osName = parser.getOS().name || "Unknown";

  const updateData = {
    clicks: admin.firestore.FieldValue.increment(1),
    [`stats.${country}.count`]: admin.firestore.FieldValue.increment(1),
    [`stats.${country}.cities.${city}`]: admin.firestore.FieldValue.increment(1),
    [`deviceStats.${deviceType}`]: admin.firestore.FieldValue.increment(1),
    [`browserStats.${browserName}`]: admin.firestore.FieldValue.increment(1),
    [`osStats.${osName}`]: admin.firestore.FieldValue.increment(1),
  };

  await docRef.update(updateData);

  return res.redirect(data.originalUrl);
};
