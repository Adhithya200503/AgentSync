import admin, { db } from "../utils/firebase.js";

export const createOrUpdateLinkPage = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { username, bio = '', profilePic = '', links = [] } = req.body;

    // Validate username
    if (!username || typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ success: false, message: 'Username is required and must be a non-empty string.' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username can only contain alphanumeric characters, underscores, hyphens, and periods.' });
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ success: false, message: 'Username must be between 3 and 30 characters long.' });
    }

    // Validate bio
    if (typeof bio !== 'string') {
      return res.status(400).json({ success: false, message: 'Bio must be a string.' });
    }
    if (bio.length > 250) {
      return res.status(400).json({ success: false, message: 'Bio cannot exceed 250 characters.' });
    }

    // Validate profile picture URL
    if (profilePic && typeof profilePic !== 'string') {
      return res.status(400).json({ success: false, message: 'Profile picture must be a URL string.' });
    }
    if (profilePic && !/^https?:\/\/.+\..+$/.test(profilePic)) {
      return res.status(400).json({ success: false, message: 'Invalid profile picture URL format.' });
    }

    // Validate links
    if (!Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one link is required.' });
    }

    for (const [index, link] of links.entries()) {
      if (!link.title || typeof link.title !== 'string' || link.title.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: Title is required.` });
      }
      if (!link.url || typeof link.url !== 'string' || link.url.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: URL is required.` });
      }
      if (!/^https?:\/\/.+\..+$/.test(link.url) && !/^mailto:.+@.+\..+$/.test(link.url)) {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: Invalid URL format. Must start with http(s):// or mailto:.` });
      }
      if (!link.icon || typeof link.icon !== 'string' || link.icon.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: Icon is required.` });
      }
    }

    const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://agentsync-5ab53.web.app';
    const linkPageUrl = `${FRONTEND_BASE_URL}/zaplink/${username}`;

    // Check if username is already taken globally
    const linkPageRef = db.collection('linkPages').doc(username);
    const linkPageSnap = await linkPageRef.get();

    if (linkPageSnap.exists) {
      const existingData = linkPageSnap.data();
      if (existingData.uid !== uid) {
        return res.status(403).json({ success: false, message: 'Username already taken by another user.' });
      }
    }

    // Preserve existing link click counts if updating
    const existingLinksMap = new Map(
      (linkPageSnap.exists && linkPageSnap.data().links || []).map(link => [link.url, link])
    );

    const formattedLinks = links.map(newLink => {
      const existingLink = existingLinksMap.get(newLink.url);
      return {
        title: newLink.title,
        url: newLink.url,
        type: newLink.title,
        icon: newLink.icon,
      };
    });

    await linkPageRef.set({
      uid,
      username,
      bio,
      profilePic,
      links: formattedLinks,
      pageClicks: linkPageSnap.exists ? linkPageSnap.data().pageClicks : 0,
      createdAt: linkPageSnap.exists ? linkPageSnap.data().createdAt : new Date(),
      updatedAt: new Date(),
      linkPageUrl,
    }, { merge: true });

    res.status(200).json({ success: true, message: 'Link page saved successfully.', linkPageUrl });
  } catch (error) {
    console.error('Error in createOrUpdateLinkPage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};


export const getLinkPageByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    console.log("triggered");
    const docRef = db.collection('linkPages').doc(username);

    const result = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);

      if (!docSnap.exists) {
        return {
          status: 404,
          data: { success: false, message: 'Link page not found.' },
        };
      }

      const currentData = docSnap.data();
      const newPageClicks = (currentData.pageClicks || 0) + 1;

      const stats = currentData.stats || [];
      const overallCount = (currentData.count || 0) + 1;

      let ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket.remoteAddress ||
        "";

      if (ip === '::1' || ip === '127.0.0.1') {
        ip = '8.8.8.8';
      }

      const geoRes = await fetch(`https://ipwho.is/${ip}`);
      const geoData = await geoRes.json();

      let country = "Unknown";
      let city = "Unknown";

      if (!geoData.success) {
        console.log("Geo lookup failed", geoData.message);
      } else {
        country = geoData.country || "Unknown";
        city = geoData.city || "Unknown";
      }

      const countryIndex = stats.findIndex(
        (c) => c.country.toLowerCase() === country.toLowerCase()
      );

      if (countryIndex > -1) {
        stats[countryIndex].count += 1;

        const cityIndex = stats[countryIndex].topCities.findIndex(
          (c) => c.city.toLowerCase() === city.toLowerCase()
        );

        if (cityIndex > -1) {
          stats[countryIndex].topCities[cityIndex].count += 1;
        } else {
          stats[countryIndex].topCities.push({ city, count: 1 });
        }

        stats[countryIndex].topCities.sort((a, b) => b.count - a.count);
        stats[countryIndex].topCities = stats[countryIndex].topCities.slice(0, 3);
      } else {
        stats.push({
          country,
          count: 1,
          topCities: [{ city, count: 1 }],
        });
      }

      transaction.update(docRef, {
        pageClicks: newPageClicks,
        stats: stats,
        count: overallCount,
      });

      return {
        status: 200,
        data: {
          success: true,
          data: { ...currentData, pageClicks: newPageClicks, stats: stats, count: overallCount },
        },
      };
    });

    res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Error in getLinkPageByUsername:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
