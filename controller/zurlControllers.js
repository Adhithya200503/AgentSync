import QRCode from "qrcode";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import admin, { db } from "../utils/firebase.js";
import { UAParser } from "ua-parser-js";

const isValidUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

 

export const createShortUrl = async (req, res) => {
  const user = req.user;

  const { originalUrl, customUrl, protected: isProtected, zaplinkIds, name, folderId, isBioGramLink } = req.body;

  if (!originalUrl || !isValidUrl(originalUrl)) {
    return res.status(400).json({ error: 'Invalid or missing originalUrl' });
  }

  const slug = customUrl?.trim() || uuidv4().slice(0, 8);

  const shortLinksCollection = db.collection('short-links');
  const docRef = shortLinksCollection.doc(slug);
  const doc = await docRef.get();

  if (doc.exists) {
    return res.status(409).json({ error: 'Custom URL (slug) already in use' });
  }

  const appBaseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  let shortUrl;
  if (!isBioGramLink) {
    const shortUrlBase = `${appBaseUrl}/Zurl`;
    shortUrl = `${shortUrlBase}/${slug}`;
  } else {
    const shortUrlBase = `${appBaseUrl}/biogram`;
    shortUrl = `${shortUrlBase}/${slug}`;
  }


  let qrCodeDataURL;
  try {
    qrCodeDataURL = await QRCode.toDataURL(originalUrl);
  } catch (qrError) {
    console.error("Error generating QR code:", qrError);
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }

  const shortUrlData = {
    shortUrl,
    shortId: slug,
    originalUrl,
    userId: user?.uid || null,
    qrcode: qrCodeDataURL,
    clicks: 0,
    createdAt: Timestamp.now(),
    isActive: true,
    protected: isProtected || false,
    unLockId: isProtected ? uuidv4() : null,
    stats: {},
    deviceStats: {},
    browserStats: {},
    osStats: {},
    folderId: folderId || null,
    name: name || null,
  };

  try {
    await docRef.set(shortUrlData);

    if (zaplinkIds && Array.isArray(zaplinkIds) && zaplinkIds.length > 0) {
      const linkPagesCollection = db.collection('linkPages');
      for (const zaplinkId of zaplinkIds) {
        const zaplinkDocRef = linkPagesCollection.doc(zaplinkId);
        try {
          const zaplinkDoc = await zaplinkDocRef.get();
          if (zaplinkDoc.exists) {
            const newZaplinkEntry = {
              icon: "link",
              title: name || shortUrl,
              type: "Custom",
              url: shortUrl,
            };

            await zaplinkDocRef.update({
              links: FieldValue.arrayUnion(newZaplinkEntry),
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Short URL added to Zaplink: ${zaplinkId}`);
          } else {
            console.warn(`Zaplink document with ID ${zaplinkId} not found.`);
          }
        } catch (updateError) {
          console.error(`Error updating Zaplink ${zaplinkId}:`, updateError);
        }
      }
    }

    return res.status(201).json({
      shortId: slug,
      shortUrl: shortUrl,
      qrcode: qrCodeDataURL,
      unLockId: isProtected ? shortUrlData.unLockId : undefined,
      name: shortUrlData.name,
    });
  } catch (dbError) {
    console.error("Error saving short link or updating Zaplinks:", dbError);
    return res.status(500).json({ error: 'Failed to create short URL or update Zaplinks' });
  }
};

export const createShortUrlWithUidParam = async (req, res) => {
  const { uid } = req.params;

  const {
    originalUrl,
    customUrl,
    protected: isProtected,
    zaplinkIds,
    name,
    folderId,
    isBioGramLink,
  } = req.body;

  if (!originalUrl || !isValidUrl(originalUrl)) {
    return res.status(400).json({ error: 'Invalid or missing originalUrl' });
  }

  if (!uid) {
    return res.status(400).json({ error: 'Missing uid in params' });
  }

  const slug = customUrl?.trim() || uuidv4().slice(0, 8);

  const shortLinksCollection = db.collection('short-links');
  const docRef = shortLinksCollection.doc(slug);
  const doc = await docRef.get();

  if (doc.exists) {
    return res.status(409).json({ error: 'Custom URL (slug) already in use' });
  }

  const appBaseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const shortUrlBase = isBioGramLink ? `${appBaseUrl}/biogram` : `${appBaseUrl}/Zurl`;
  const shortUrl = `${shortUrlBase}/${slug}`;

  let qrCodeDataURL;
  try {
    qrCodeDataURL = await QRCode.toDataURL(originalUrl);
  } catch (qrError) {
    console.error("Error generating QR code:", qrError);
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }

  const shortUrlData = {
    shortUrl,
    shortId: slug,
    originalUrl,
    userId: uid,
    qrcode: qrCodeDataURL,
    clicks: 0,
    createdAt: Timestamp.now(),
    isActive: true,
    protected: isProtected || false,
    unLockId: isProtected ? uuidv4() : null,
    stats: {},
    deviceStats: {},
    browserStats: {},
    osStats: {},
    folderId: folderId || null,
    name: name || null,
  };

  try {
    await docRef.set(shortUrlData);

    if (zaplinkIds && Array.isArray(zaplinkIds) && zaplinkIds.length > 0) {
      const linkPagesCollection = db.collection('linkPages');
      for (const zaplinkId of zaplinkIds) {
        const zaplinkDocRef = linkPagesCollection.doc(zaplinkId);
        try {
          const zaplinkDoc = await zaplinkDocRef.get();
          if (zaplinkDoc.exists) {
            const newZaplinkEntry = {
              icon: "link",
              title: name || shortUrl,
              type: "Custom",
              url: shortUrl,
            };

            await zaplinkDocRef.update({
              links: FieldValue.arrayUnion(newZaplinkEntry),
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log(`Short URL added to Zaplink: ${zaplinkId}`);
          } else {
            console.warn(`Zaplink document with ID ${zaplinkId} not found.`);
          }
        } catch (updateError) {
          console.error(`Error updating Zaplink ${zaplinkId}:`, updateError);
        }
      }
    }

    return res.status(201).json({
      shortId: slug,
      shortUrl,
      qrcode: qrCodeDataURL,
      unLockId: isProtected ? shortUrlData.unLockId : undefined,
      name: shortUrlData.name,
    });
  } catch (dbError) {
    console.error("Error saving short link or updating Zaplinks:", dbError);
    return res.status(500).json({ error: 'Failed to create short URL or update Zaplinks' });
  }
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

  
  const validPaths = [`/Zurl/${shortId}`, `/biogram/${shortId}`];
  const isValidPath = validPaths.some((path) => req.originalUrl.includes(path));

  if (!isValidPath) {
    return res.status(404).send("Invalid short link path.");
  }

  if (!data.isActive) {
    return res.status(410).send("Link is no longer active");
  }

  if (data.protected) {
    const protectedRedirectBase = `https://agentsync-5ab53.web.app/Zurl/unlock`;
    return res.redirect(`${protectedRedirectBase}/${shortId}`);
  }

  let ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "";
  let country = "Unknown";
  let city = "Unknown";

  try {
    const geoRes = await fetch(`https://ipwho.is/${ip}`);
    const geoData = await geoRes.json();
    if (geoData.success) {
      country = geoData.country || "Unknown";
      city = geoData.city || "Unknown";
    }
  } catch (error) {
    console.error("Error fetching geo data:", error);
  }

  
  const parser = new UAParser(req.headers["user-agent"]);
  const browserName = parser.getBrowser().name || "Unknown";
  const deviceType = parser.getDevice().type || "Unknown";
  const osName = parser.getOS().name || "Unknown";

  const updateData = {
    clicks: admin.firestore.FieldValue.increment(1),
    [`stats.${country}.count`]: admin.firestore.FieldValue.increment(1),
    [`stats.${country}.cities.${city}`]: admin.firestore.FieldValue.increment(1),
    [`deviceStats.${deviceType}`]: admin.firestore.FieldValue.increment(1),
    [`browserStats.${browserName}`]: admin.firestore.FieldValue.increment(1),
    [`osStats.${osName}`]: admin.firestore.FieldValue.increment(1),
    lastClickedAt: new Date().toISOString(),
  };

  try {
    await docRef.update(updateData);
  } catch (updateError) {
    console.error("Error updating analytics:", updateError);
  }

  return res.redirect(data.originalUrl);
};
