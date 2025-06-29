import admin, { db } from "../utils/firebase.js";
import cloudinary from "../utils/cloudinary.js";
import { Buffer } from 'buffer';
import { v4 as uuidv4 } from 'uuid'; // <-- ADD THIS LINE to import uuid

const PLATFORMS = [
    { name: "Website", icon: "website", prefix: "https://" },
    { name: "Instagram", icon: "instagram", prefix: "https://instagram.com/" },
    { name: "Facebook", icon: "facebook-f", prefix: "https://facebook.com/" },
    { name: "LinkedIn", icon: "linkedin-in", prefix: "https://linkedin.com/in/" },
    { name: "Twitter", icon: "twitter", prefix: "https://twitter.com/" },
    { name: "YouTube", icon: "youtube", prefix: "https://www.youtube.com/channel/" },
    { name: "Twitch", icon: "twitch", prefix: "https://twitch.tv/" },
    { name: "GitHub", icon: "github", prefix: "https://github.com/" },
    { name: "Discord", icon: "discord", prefix: "https://discord.gg/" },
    { name: "Gmail", icon: "envelope", prefix: "mailto:" },
    { name: "Custom", icon: "link", prefix: "" },
];

const deleteCloudinaryImage = async (publicId) => {
    if (publicId) {
        try {
            await cloudinary.uploader.destroy(publicId);
            console.log('Successfully deleted Cloudinary image:', publicId);
        } catch (error) {
            console.error('Error deleting Cloudinary image:', publicId, error);
        }
    }
};

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

        let profilePicUrl = '';
        let profilePicPublicId = '';
        const profilePicFile = req.files && req.files.profilePic;

        if (profilePicFile) {
            try {
                if (
                    !profilePicFile.data ||
                    !Buffer.isBuffer(profilePicFile.data) ||
                    !profilePicFile.mimetype ||
                    profilePicFile.data.length === 0
                ) {
                    console.error('Validation failed for profile picture file.');
                    return res.status(400).json({ success: false, message: 'Invalid or empty profile picture file.' });
                }

                const base64Data = profilePicFile.data.toString('base64');
                const base64ProfilePic = `data:${profilePicFile.mimetype};base64,${base64Data}`;

                const result = await cloudinary.uploader.upload(base64ProfilePic, {
                    folder: 'zaplink/profile_pictures',
                    resource_type: 'auto',
                });

                profilePicUrl = result.secure_url;
                profilePicPublicId = result.public_id;
                console.log('Profile picture uploaded:', profilePicUrl, profilePicPublicId);
            } catch (uploadError) {
                console.error('Cloudinary profile picture upload error:', uploadError);
                return res.status(500).json({ success: false, message: 'Failed to upload profile picture.' });
            }
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

        const processedLinks = [];
        const urlRegex = /^(https?|mailto|tel|sms|whatsapp):\/\/[^\s$.?#].[^\s]*$/i;

        if (Array.isArray(links)) {
            for (const [index, link] of links.entries()) {
                const linkPlatform = (typeof link.platform === 'string' && link.platform.trim() !== '')
                    ? link.platform.trim()
                    : PLATFORMS[0].name;

                const linkTitle = (typeof link.title === 'string' && link.title.trim() !== '')
                    ? link.title.trim()
                    : PLATFORMS.find(p => p.name === linkPlatform)?.name || 'Link';

                const linkUrl = (typeof link.url === 'string' && link.url.trim() !== '')
                    ? link.url.trim()
                    : '';

                const linkIcon = (typeof link.icon === 'string' && link.icon.trim() !== '')
                    ? link.icon.trim()
                    : linkPlatform.toLowerCase();

                // Add validation for link properties (url, title, icon)
                if (!linkUrl) {
                    return res.status(400).json({ success: false, message: `Link ${index + 1}: URL is required.` });
                }
                if (!urlRegex.test(linkUrl) &&
                    !linkUrl.startsWith('mailto:') &&
                    !linkUrl.startsWith('tel:') &&
                    !linkUrl.startsWith('sms:') &&
                    !linkUrl.startsWith('whatsapp:')) {
                    return res.status(400).json({
                        success: false,
                        message: `Link ${index + 1}: Invalid URL format. Must be a valid web URL, mailto:, tel:, sms:, or whatsapp:.`
                    });
                }
                if (!linkTitle) {
                    return res.status(400).json({ success: false, message: `Link ${index + 1}: Title is required.` });
                }
                if (!linkIcon) {
                    return res.status(400).json({ success: false, message: `Link ${index + 1}: Icon is required.` });
                }

                let linkImageUrl = '';
                let linkImagePublicId = '';
                const customLinkImageFile = req.files && req.files[`linkImage_${index}`];

                if (customLinkImageFile) {
                    try {
                        if (
                            !customLinkImageFile.data ||
                            !Buffer.isBuffer(customLinkImageFile.data) ||
                            !customLinkImageFile.mimetype ||
                            customLinkImageFile.data.length === 0
                        ) {
                            console.error(`Validation failed for link image file at index ${index}.`);
                            return res.status(400).json({ success: false, message: `Invalid or empty image for link ${index + 1}.` });
                        }

                        const base64Image = customLinkImageFile.data.toString('base64');
                        const base64CustomLinkImage = `data:${customLinkImageFile.mimetype};base64,${base64Image}`;

                        const result = await cloudinary.uploader.upload(base64CustomLinkImage, {
                            folder: 'zaplink/link_images',
                            resource_type: 'auto',
                        });
                        linkImageUrl = result.secure_url;
                        linkImagePublicId = result.public_id;
                    } catch (uploadError) {
                        console.error(`Cloudinary link image upload error for link ${index + 1}:`, uploadError);
                    }
                }

                processedLinks.push({
                    id: link.id || uuidv4(), // <-- FIX: Ensure ID is always defined
                    title: linkTitle,
                    url: linkUrl,
                    type: linkPlatform,
                    icon: linkIcon,
                    linkImage: linkImageUrl,
                    linkImagePublicId: linkImagePublicId
                });
            }
        } else {
            return res.status(400).json({ success: false, message: 'At least one link is required.' });
        }

        const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://agentsync-5ab53.web.app';
        const linkPageUrl = `${FRONTEND_BASE_URL}/zaplink/${username}`;

        const linkPageRef = db.collection('linkPages').doc(username);
        const linkPageSnap = await linkPageRef.get();

        if (linkPageSnap.exists) {
            return res.status(409).json({ success: false, message: 'Username already taken. Please choose a different one.' });
        }

        await linkPageRef.set({
            uid,
            username: username.trim(),
            bio: bio ? bio.trim() : '',
            profilePicUrl,
            profilePicPublicId,
            links: processedLinks,
            pageClicks: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            linkPageUrl,
            template: template || 'default'
        });

        res.status(200).json({ success: true, message: 'Zap link created successfully.', linkPageUrl });
    } catch (error) {
        console.error('Error in createZapLink (general catch):', error);
        res.status(500).json({ success: false, error: error.message || 'An unexpected error occurred.' });
    }
};


export const editZapLink = async (req, res) => {
  const deleteCloudinaryImage = async (publicId) => {
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
        console.log("Deleted image:", publicId);
      } catch (err) {
        console.error("Cloudinary deletion error:", publicId, err);
      }
    }
  };

  try {
    const uid = req.user.uid;
    const { username } = req.params;
    const { bio, template } = req.body;
    const profilePicFile = req.files?.profilePic;
    const removeProfilePic = req.body.removeProfilePic === "true";

    if (!username || typeof username !== "string" || username.trim() === "") {
      return res.status(400).json({ success: false, message: "Username is required in path." });
    }

    const pageRef = db.collection("linkPages").doc(username);
    const snap = await pageRef.get();

    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "Page not found." });
    }

    const existing = snap.data();
    if (existing.uid !== uid) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const updateData = { updatedAt: new Date() };

    if (typeof bio === "string") {
      if (bio.length > 250) {
        return res.status(400).json({ success: false, message: "Bio too long." });
      }
      updateData.bio = bio.trim();
    }

    if (template !== undefined) {
      updateData.template = template;
    }

    if (profilePicFile) {
      if (existing.profilePicPublicId) {
        await deleteCloudinaryImage(existing.profilePicPublicId);
      }
      const base64Data = profilePicFile.data.toString("base64");
      const base64 = `data:${profilePicFile.mimetype};base64,${base64Data}`;
      const uploaded = await cloudinary.uploader.upload(base64, {
        folder: "zaplink/profile_pictures",
        resource_type: "auto",
      });
      updateData.profilePicUrl = uploaded.secure_url;
      updateData.profilePicPublicId = uploaded.public_id;
    } else if (removeProfilePic) {
      if (existing.profilePicPublicId) {
        await deleteCloudinaryImage(existing.profilePicPublicId);
      }
      updateData.profilePicUrl = "";
      updateData.profilePicPublicId = "";
    }

    // Handle links only if explicitly sent
    if (req.body.links !== undefined) {
      let links;
      try {
        links = JSON.parse(req.body.links);
      } catch (e) {
        return res.status(400).json({ success: false, message: "Invalid links format." });
      }

      const existingLinkMap = new Map((existing.links || []).map(l => [l.id, l]));
      const processedLinks = [];

      for (const [index, link] of links.entries()) {
        const { id, title, url, type = "Website", icon, linkImagePublicId } = link;
        if (!url || typeof url !== "string") {
          return res.status(400).json({ success: false, message: `Link ${index + 1} missing URL.` });
        }
        const prev = existingLinkMap.get(id);

        let linkImage = prev?.linkImage || "";
        let linkPublicId = prev?.linkImagePublicId || "";

        const imgFile = req.files?.[`linkImage_${index}`];
        if (imgFile) {
          if (linkPublicId) await deleteCloudinaryImage(linkPublicId);
          const base64 = imgFile.data.toString("base64");
          const result = await cloudinary.uploader.upload(`data:${imgFile.mimetype};base64,${base64}`, {
            folder: "zaplink/link_images",
            resource_type: "auto",
          });
          linkImage = result.secure_url;
          linkPublicId = result.public_id;
        } else if (linkImagePublicId === "REMOVE") {
          if (linkPublicId) await deleteCloudinaryImage(linkPublicId);
          linkImage = "";
          linkPublicId = "";
        }

        processedLinks.push({
          id: id || uuidv4(),
          title: title?.trim() || "Link",
          url: url.trim(),
          type,
          icon: icon || type.toLowerCase(),
          linkImage,
          linkImagePublicId: linkPublicId,
        });
      }

      updateData.links = processedLinks;

      const removedIds = Array.from(existingLinkMap.keys()).filter(id => !links.some(l => l.id === id));
      for (const id of removedIds) {
        const old = existingLinkMap.get(id);
        if (old?.linkImagePublicId) {
          await deleteCloudinaryImage(old.linkImagePublicId);
        }
      }
    }

    await pageRef.update(updateData);
    const link = `${process.env.FRONTEND_BASE_URL || "https://yourapp.com"}/zaplink/${username}`;
    return res.status(200).json({ success: true, message: "Page updated.", linkPageUrl: link });
  } catch (err) {
    console.error("editZapLink error:", err);
    return res.status(500).json({ success: false, error: err.message || "Unexpected error" });
  }
};

export const getLinkPageByUsername = async (req, res) => {
    try {
        const { username } = req.params;
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
        res.status(500).json({ success: false, error: error.message || 'An unexpected error occurred.' });
    }
};

export const getLinkPageByUsernameWithoutStats = async (req, res) => {
    try {
        const { username } = req.params;

        const docRef = db.collection("linkPages").doc(username);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return res.status(404).json({
                success: false,
                message: "Link page not found.",
            });
        }

        const data = docSnap.data();

        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Error in getLinkPageByUsernameWithoutStats:", error);
        return res.status(500).json({
            success: false,
            error: error.message || 'An unexpected error occurred.',
        });
    }
};

export const getAllUserZapLinks = async (req, res) => {
    try {
        const uid = req.user.uid;

        if (!uid) {
            return res.status(401).json({ success: false, message: 'User not authenticated.' });
        }

        const zaplinksRef = db.collection('linkPages');
        const q = zaplinksRef.where('uid', '==', uid);
        const snapshot = await q.get();

        const zaplinks = [];

        if (snapshot.empty) {
            return res.status(200).json({ success: true, message: 'No zaplinks found for this user.', data: [] });
        }

        snapshot.forEach(doc => {
            zaplinks.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({ success: true, message: 'Successfully retrieved user zaplinks.', data: zaplinks });

    } catch (error) {
        console.error('Error fetching user zaplinks:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve user zaplinks.', error: error.message || 'An unexpected error occurred.' });
    }
};


export const deleteZapLink = async (req, res) => {
    try {
        const uid = req.user.uid;
        const { username } = req.params;

        if (!username || typeof username !== 'string' || username.trim() === '') {
            return res.status(400).json({ success: false, message: 'Username is required in the URL path.' });
        }

        const linkPageRef = db.collection('linkPages').doc(username);
        const linkPageSnap = await linkPageRef.get();

        if (!linkPageSnap.exists) {
            return res.status(404).json({ success: false, message: 'Zap link page not found.' });
        }

        const existingPageData = linkPageSnap.data();


        if (existingPageData.uid !== uid) {
            return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to delete this page.' });
        }


        if (existingPageData.profilePicPublicId) {
            await deleteCloudinaryImage(existingPageData.profilePicPublicId);
        }


        if (Array.isArray(existingPageData.links)) {
            for (const link of existingPageData.links) {
                if (link.linkImagePublicId) {
                    await deleteCloudinaryImage(link.linkImagePublicId);
                }
            }
        }


        await linkPageRef.delete();

        res.status(200).json({ success: true, message: 'Zap link page deleted successfully.' });

    } catch (error) {
        console.error('Error in deleteZapLink:', error);
        res.status(500).json({ success: false, error: error.message || 'An unexpected error occurred.' });
    }
};
const DEFAULT_TEMPLATE_IDS = [
  "vGiuqWWFVmulh7IJX0q6", // DEFAULT
  "LeOo5qf0kLwsvahpci0y", // FROSTED GLASS
  "4qZzlAbsE2hPA59BY02J", // BREEZE
  "X9QeSmT5Ff97CGB763A2", // COLOR BURST
  "RNvpeceto6xp6D0vGif5", // TERMINAL
  "wDXdhe9mOLJiE2KtPRXq", // PASTEL
  "UYedaoLp20Pc9DlsEvTg", // GAMER
];

export const createOrUpdateTemplate = async (req, res) => {
  const userId = req.user?.uid;
  const {
    templateId = null,
    customizer,
    isPublic = false,
    createdBy = userId,
    templateName = null,
    baseTemplate = "default",
    isTemplateInUse,
  } = req.body;

  if (!userId || typeof customizer !== "object") {
    return res.status(400).json({ success: false, message: "Invalid input." });
  }

  try {
    let docRef;
    let isNew = true;

    if (templateId) {
      if (DEFAULT_TEMPLATE_IDS.includes(templateId)) {
        return res.status(403).json({
          success: false,
          message: "This is a default template and cannot be edited.",
        });
      }

      docRef = db.collection("templates").doc(templateId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ success: false, message: "Template not found." });
      }

      const existingData = docSnap.data();
 
      if (existingData.createdBy !== userId) {
        return res.status(403).json({ success: false, message: "Unauthorized to edit this template." });
      }

      isNew = false;
    } else {
      docRef = db.collection("templates").doc();
    }

    await docRef.set(
      {
        userId,
        customizer,
        isPublic,
        createdBy: isNew ? userId : undefined,
        templateName,
        baseTemplate,
        isTemplateInUse,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(isNew && {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      },
      { merge: true }
    );

    return res.status(200).json({
      success: true,
      message: isNew ? "Template created successfully." : "Template updated successfully.",
      templateId: docRef.id,
    });
  } catch (error) {
    console.error("Error saving template:", error);
    return res.status(500).json({ success: false, message: "Failed to save template." });
  }
};

export const getAllUserTemplates = async (req, res) => {
    const userId = req.user?.uid;

    if (!userId) {
        return res.status(400).json({ success: false, message: "User ID missing." });
    }

    try {
        const snapshot = await db
            .collection("templates")
            .where("userId", "==", userId)
            .orderBy("updatedAt", "desc")
            .get();

        const templates = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return res.status(200).json({ success: true, data: templates });
    } catch (error) {
        console.error("Error fetching templates:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch templates." });
    }
};


export const getTemplateById = async (req, res) => {
    const { templateId } = req.params;

    if (!templateId) {
        return res.status(400).json({ success: false, message: "Template ID missing." });
    }

    try {
        const doc = await db.collection("templates").doc(templateId).get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, message: "Template not found." });
        }

        return res.status(200).json({ success: true, data: { id: doc.id, ...doc.data() } });
    } catch (error) {
        console.error("Error fetching template:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch template." });
    }
};


export const getAllTemplates = async (req, res) => {
  try {
    const snapshot = await db
      .collection("templates")
      .orderBy("updatedAt", "desc")
      .get();

    const templates = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({ success: true, data: templates });
  } catch (error) {
    console.error("Error fetching all templates:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch all templates.",
    });
  }
};
