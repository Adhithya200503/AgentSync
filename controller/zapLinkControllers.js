import admin, { db } from "../utils/firebase.js";
import cloudinary from "../utils/cloudinary.js"
import path from "path";
export const createZapLink = async (req, res) => {
  try {
    const uid = req.user.uid;

    const { username, bio, template } = req.body;

    let links = [];
    if (req.body.links) {
      try {
        links = JSON.parse(req.body.links);
      } catch (parseError) {
        console.error('Error parsing links JSON:', parseError);
        return res.status(400).json({ success: false, message: 'Invalid links data format.' });
      }
    }

    let profilePicUrl = req.body.profilePicUrl || '';


    const profilePicFile = req.files && req.files.profilePic;

    if (profilePicFile) {
      try {
       
        const result = await cloudinary.uploader.upload(profilePicFile.data, {
          folder: 'zaplink',
          resource_type: 'auto', 
        
        });
        profilePicUrl = result.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary profile picture upload error:', uploadError);
        return res.status(500).json({ success: false, message: 'Failed to upload profile picture.' });
      }
    } else if (req.body.profilePicUrl) {
      profilePicUrl = req.body.profilePicUrl;
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

    if (!Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one link is required.' });
    }

    const processedLinks = [];
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

      let linkImageUrl = '';

      const customLinkImageFile = req.files && req.files[`linkImage_${index}`];

      if (link.platform === 'Custom') {
        if (customLinkImageFile) {
          try {
           
            const result = await cloudinary.uploader.upload(customLinkImageFile.data, {
              folder: 'zaplink/custom_link_images',
              resource_type: 'auto', 
            });
            linkImageUrl = result.secure_url;
          } catch (uploadError) {
            console.error(`Cloudinary custom link image upload error for link ${index + 1}:`, uploadError);
            return res.status(500).json({ success: false, message: `Failed to upload image for link ${index + 1}.` });
          }
        } else if (req.body[`linkImageExistingUrl_${index}`]) {
          linkImageUrl = req.body[`linkImageExistingUrl_${index}`];
        }
      } else {
        linkImageUrl = '';
      }

      processedLinks.push({
        title: link.title,
        url: link.url,
        type: link.title,
        icon: link.icon,
        linkImage: linkImageUrl,
      });
    }

    const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://agentsync-5ab53.web.app';
    const linkPageUrl = `${FRONTEND_BASE_URL}/zaplink/${username}`;

    const linkPageRef = db.collection('linkPages').doc(username);
    const linkPageSnap = await linkPageRef.get();

    if (linkPageSnap.exists && linkPageSnap.data().uid !== uid) {
      return res.status(403).json({ success: false, message: 'Username already taken by another user.' });
    }

    await linkPageRef.set({
      uid,
      username,
      bio: bio || '',
      profilePicUrl: profilePicUrl,
      links: processedLinks,
      pageClicks: linkPageSnap.exists ? linkPageSnap.data().pageClicks : 0,
      createdAt: linkPageSnap.exists ? linkPageSnap.data().createdAt : new Date(),
      updatedAt: new Date(),
      linkPageUrl,
      template
    }, { merge: true });

    res.status(200).json({ success: true, message: 'Zap link saved successfully.', linkPageUrl });
  } catch (error) {
    console.error('Error in createZapLink:', error);
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
