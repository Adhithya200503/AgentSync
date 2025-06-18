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

const normalizeHost = (host) => {
  try {
    const url = new URL(`http://${host}`);
    let normalized = url.hostname;
    if (normalized.startsWith('www.')) {
      normalized = normalized.substring(4);
    }
    return normalized;
  } catch (error) {
    console.error("Error normalizing host:", host, error);
    return host;
  }
};

export const createShortUrl = async (req, res) => {
  const user = req.user; // Assumes user is populated by middleware

  const { originalUrl, customUrl, customDomain, protected: isProtected, zaplinkIds, name } = req.body;

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

  let shortUrlBase;
  let storedCustomDomain = "";

  if (customDomain && customDomain.trim() !== "") {
    if (!normalizeHost(customDomain).includes('.')) {
      return res.status(400).json({ error: 'Invalid customDomain format' });
    }
    shortUrlBase = `https://${normalizeHost(customDomain)}`;
    storedCustomDomain = normalizeHost(customDomain);
  } else {
 
    const appBaseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    shortUrlBase = `${appBaseUrl}/Zurl`;  
  }

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
    userId: user?.uid || null,
    qrcode: qrCodeDataURL,
    clicks: 0,
    createdAt: FieldValue.serverTimestamp(), 
    customDomain: storedCustomDomain, 
    isActive: true,
    protected: isProtected || false,
    unLockId: isProtected ? uuidv4() : null,
    stats: {},
    deviceStats: {},
    browserStats: {},
    osStats: {},
    folderId: null,
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

export const redirectShortUrl = async (req, res) => {
  const { shortId } = req.params;
  const requestHost = req.headers.host;

  if (!shortId) {
    return res.status(400).send("Missing shortId");
  }

  const docRef = db.collection("short-links").doc(shortId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return res.status(404).send("Short link not found");
  }

  const data = doc.data();

  const normalizedRequestHost = normalizeHost(requestHost);
  let expectedDomainMatch = false;

  if (data.customUrl && data.customUrl !== "") {
    expectedDomainMatch = normalizedRequestHost === normalizeHost(data.customUrl);
  } else {
    const appBaseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const normalizedAppBaseHost = normalizeHost(new URL(appBaseUrl).host);

    const isDefaultPath = req.originalUrl.includes(`/Zurl/${shortId}`);

    expectedDomainMatch = normalizedRequestHost === normalizedAppBaseHost && isDefaultPath;
  }

  if (!expectedDomainMatch) {
    console.warn(`Attempted access of shortId ${shortId} on host ${requestHost} (expected customUrl: ${data.customUrl || 'default'})`);
    return res.status(404).send("Short link not found for this domain or path.");
  }

  if (!data.isActive) {
    return res.status(410).send("Link is no longer active");
  }

  if (data.protected) {
    const protectedRedirectBase = `https://${requestHost}/zurl/unlock`;
    return res.redirect(`${protectedRedirectBase}/${shortId}`);
  }

  let ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "";

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

  await docRef.update(updateData);

  return res.redirect(data.originalUrl);
};
