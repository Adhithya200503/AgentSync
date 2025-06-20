import admin, { db } from "../utils/firebase.js";
import { promises as fs } from 'fs';
import cloudinary from "../utils/cloudinary.js";

export const createOrUpdateLinkPage = async (req, res) => {
  const tempFilePaths = [];

  try {
    const uid = req.user.uid;

    const { username, bio = '', template } = req.body;
    const uploadedFiles = req.files || {};

    const rawLinks = req.body;
    const incomingLinks = [];
    let i = 0;
    while (rawLinks[`links[${i}][platform]`] !== undefined) {
      const link = {
        platform: rawLinks[`links[${i}][platform]`],
        value: rawLinks[`links[${i}][value]`],
        title: rawLinks[`links[${i}][title]`],
        icon: rawLinks[`links[${i}][originalIcon]`],
      };

      if (rawLinks[`links[${i}][existingCustomIconUrl]`]) {
        link.existingCustomIconUrl = rawLinks[`links[${i}][existingCustomIconUrl]`];
      }

      if (rawLinks[`links[${i}][existingCustomIconId]`]) {
        link.existingCustomIconId = rawLinks[`links[${i}][existingCustomIconId]`];
      }
      incomingLinks.push(link);
      i++;
    }

    if (!username || typeof username !== 'string' || username.trim() === '') {
      return res.status(400).json({ success: false, message: 'Username is required and must be a non-empty string.' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username can only contain alphanumeric characters, underscores, hyphens, and periods.' });
    }
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ success: false, message: 'Username must be between 3 and 30 characters long.' });
    }

    if (typeof bio !== 'string') {
      return res.status(400).json({ success: false, message: 'Bio must be a string.' });
    }
    if (bio.length > 250) {
      return res.status(400).json({ success: false, message: 'Bio cannot exceed 250 characters.' });
    }

    if (!Array.isArray(incomingLinks) || incomingLinks.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one link is required.' });
    }

    for (const [index, link] of incomingLinks.entries()) {
      if (!link.title || typeof link.title !== 'string' || link.title.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: Title is required.` });
      }
      if (!link.value || typeof link.value !== 'string' || link.value.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: URL is required.` });
      }
      if (!/^https?:\/\/.+\..+$/.test(link.value) && !/^mailto:.+@.+\..+$/.test(link.value)) {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: Invalid URL format. Must start with http(s):// or mailto:.` });
      }
    }

    const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://agentsync-5ab53.web.app';
    const linkPageUrl = `${FRONTEND_BASE_URL}/zaplink/${username}`;

    const linkPageRef = db.collection('linkPages').doc(username);
    const linkPageSnap = await linkPageRef.get();

    if (linkPageSnap.exists) {
      const existingData = linkPageSnap.data();
      if (existingData.uid !== uid) {
        return res.status(403).json({ success: false, message: 'Username already taken by another user.' });
      }
    }

    let profilePicUrl = null;
    let profilePicId = null;
    const profilePicFile = uploadedFiles.profilePic;

    if (profilePicFile) {
      // New profile picture uploaded
      tempFilePaths.push(profilePicFile.tempFilePath);

      if (!profilePicFile.mimetype.startsWith('image/')) {
        return res.status(400).json({ success: false, message: 'Profile picture must be an image file.' });
      }
      try {
        const result = await cloudinary.uploader.upload(profilePicFile.tempFilePath, {
          folder: `zaplink/profile_pics`,
        });
        profilePicUrl = result.secure_url;
        profilePicId = result.public_id; // Store the public_id
      } catch (uploadError) {
        console.error(`Error uploading profile pic from ${profilePicFile.tempFilePath} to Cloudinary:`, uploadError);
        return res.status(500).json({ success: false, message: 'Failed to upload profile picture to Cloudinary.' });
      }
    } else {
      // No new profile picture, retain existing if any
      const existingData = linkPageSnap.exists ? linkPageSnap.data() : null;
      if (existingData && existingData.profilePic) {
        profilePicUrl = existingData.profilePic;
        profilePicId = existingData.profilePicId || null; // Retain existing ID from DB
      }
    }

    const processedLinks = [];

    const existingLinksFromDBMap = new Map(
      (linkPageSnap.exists && linkPageSnap.data().links || []).map(link => [link.url, link])
    );

    for (const [index, link] of incomingLinks.entries()) {
      let finalIcon = link.icon;
      let finalIconId = null;


      const existingLinkInDB = existingLinksFromDBMap.get(link.value);

      const customIconFile = uploadedFiles[`links[${index}][customIcon]`];

      if (customIconFile) {

        tempFilePaths.push(customIconFile.tempFilePath);

        if (!customIconFile.mimetype.startsWith('image/')) {
          return res.status(400).json({ success: false, message: `Link ${index + 1}: Custom icon must be an image file.` });
        }
        try {
          const result = await cloudinary.uploader.upload(customIconFile.tempFilePath, {
            folder: `zaplink/custom_icons`,
          });
          finalIcon = result.secure_url;
          finalIconId = result.public_id;
        } catch (uploadError) {
          console.error(`Error uploading custom icon from ${customIconFile.tempFilePath} to Cloudinary:`, uploadError);
          return res.status(500).json({ success: false, message: `Failed to upload custom icon for link ${index + 1} to Cloudinary.` });
        }
      } else if (link.existingCustomIconUrl) {

        finalIcon = link.existingCustomIconUrl;

        if (existingLinkInDB && existingLinkInDB.iconId) {
          finalIconId = existingLinkInDB.iconId;
        } else if (link.existingCustomIconId) {

          finalIconId = link.existingCustomIconId;
        }
      } else {

        if (existingLinkInDB) {

          finalIcon = existingLinkInDB.icon;
          finalIconId = existingLinkInDB.iconId || null;
        } else {

          finalIcon = link.icon;
          finalIconId = null;
        }
      }

      processedLinks.push({
        title: link.title,
        url: link.value,
        icon: finalIcon,
        iconId: finalIconId,
      });
    }


    const existingLinksForClicksMap = new Map(
      (linkPageSnap.exists && linkPageSnap.data().links || []).map(link => [link.url, link])
    );

    const linksToSave = processedLinks.map(newLink => {
      const existingLinkForClicks = existingLinksForClicksMap.get(newLink.url);
      return {
        title: newLink.title,
        url: newLink.url,
        icon: newLink.icon,
        iconId: newLink.iconId,
        clicks: existingLinkForClicks ? existingLinkForClicks.clicks : 0,
      };
    });

    await linkPageRef.set({
      uid,
      username,
      bio,
      profilePic: profilePicUrl,
      profilePicId: profilePicId,
      links: linksToSave,
      pageClicks: linkPageSnap.exists ? linkPageSnap.data().pageClicks : 0,
      createdAt: linkPageSnap.exists ? linkPageSnap.data().createdAt : new Date(),
      updatedAt: new Date(),
      linkPageUrl,
      template
    }, { merge: true });

    res.status(200).json({ success: true, message: 'Link page saved successfully.', linkPageUrl });
  } catch (error) {
    console.error('Error in createOrUpdateLinkPage:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'One or more files are too large. Maximum size is 5MB per file.' });
    }
    res.status(500).json({ success: false, error: error.message || 'Internal server error.' });
  } finally {
    for (const filePath of tempFilePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`Deleted temporary file: ${filePath}`);
      } catch (unlinkErr) {
        console.error(`Error deleting temp file ${filePath}:`, unlinkErr);
      }
    }
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
