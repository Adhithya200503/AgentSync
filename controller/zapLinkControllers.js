import admin, { db } from "../utils/firebase.js";
import cloudinary from "../utils/cloudinary.js";


 

export const createZapLink = async (req, res) => {
  try {
    // --- DEBUGGING: Log req.files at the start ---
    console.log('--- Backend: req.files ---');
    console.log(req.files); // This will show the raw file objects received
    console.log('---------------------------');
    // --- END DEBUGGING ---

    const uid = req.user.uid; // Assuming req.user is populated by your authentication middleware
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

    let profilePicUrl = ''; // Default to empty for new creation
    let profilePicPublicId = ''; // Default to empty for new creation
    const profilePicFile = req.files && req.files.profilePic; // Check if profilePic file exists in req.files

    if (profilePicFile) {
      try {
        // Basic validation for the uploaded profile picture file
        if (
          !profilePicFile.data ||
          !Buffer.isBuffer(profilePicFile.data) ||
          !profilePicFile.mimetype ||
          profilePicFile.data.length === 0
        ) {
          console.error('Validation failed for profile picture file.');
          return res.status(400).json({ success: false, message: 'Invalid or empty profile picture file.' });
        }

        // Convert buffer data to base64 string for Cloudinary upload
        const base64Data = profilePicFile.data.toString('base64');
        const base64ProfilePic = `data:${profilePicFile.mimetype};base64,${base64Data}`;

        // Upload profile picture to Cloudinary
        const result = await cloudinary.uploader.upload(base64ProfilePic, {
          folder: 'zaplink/profile_pictures', // Cloudinary folder
          resource_type: 'auto', // Automatically determine resource type
        });

        profilePicUrl = result.secure_url; // Get the secure URL of the uploaded image
        profilePicPublicId = result.public_id; // Get the public ID for potential future deletion
        console.log('Profile picture uploaded:', profilePicUrl, profilePicPublicId); // Log success
      } catch (uploadError) {
        console.error('Cloudinary profile picture upload error:', uploadError);
        return res.status(500).json({ success: false, message: 'Failed to upload profile picture.' });
      }
    }

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

    // Validate links array
    if (!Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one link is required.' });
    }

    const processedLinks = [];
    for (const [index, link] of links.entries()) {
      // --- NEW DEBUGGING LOG: Crucial for understanding 'platform' value ---
      console.log(`Backend: link.platform for link at index ${index}:`, link.platform);
      // --- END NEW DEBUGGING LOG ---

      // Validate individual link properties
      if (!link.title || typeof link.title !== 'string' || link.title.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: Title is required.` });
      }
      if (!link.url || typeof link.url !== 'string' || link.url.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: URL is required.` });
      }

      // More robust URL validation
      const urlRegex = /^(https?|mailto|tel|sms|whatsapp):\/\/[^\s$.?#].[^\s]*$/i;
      if (!urlRegex.test(link.url) &&
        !link.url.startsWith('mailto:') &&
        !link.url.startsWith('tel:') &&
        !link.url.startsWith('sms:') &&
        !link.url.startsWith('whatsapp:')) {
        return res.status(400).json({
          success: false,
          message: `Link ${index + 1}: Invalid URL format. Must be a valid web URL, mailto:, tel:, sms:, or whatsapp:.`
        });
      }

      if (!link.icon || typeof link.icon !== 'string' || link.icon.trim() === '') {
        return res.status(400).json({ success: false, message: `Link ${index + 1}: Icon is required.` });
      }

      let linkImageUrl = '';
      let linkImagePublicId = '';
      // Get the specific custom link image file by its dynamic name (e.g., linkImage_0)
      const customLinkImageFile = req.files && req.files[`linkImage_${index}`];

      // Only attempt to upload image if it's a 'Custom' platform link
      if (link.platform === 'Custom') {
        if (customLinkImageFile) {
          console.log(`Processing custom link image for index ${index}:`, customLinkImageFile.name);
          try {
            // Basic validation for the uploaded custom link image file
            if (
              !customLinkImageFile.data ||
              !Buffer.isBuffer(customLinkImageFile.data) ||
              !customLinkImageFile.mimetype ||
              customLinkImageFile.data.length === 0
            ) {
              console.error(`Validation failed for custom link image file at index ${index}.`);
              return res.status(400).json({ success: false, message: `Invalid or empty image for link ${index + 1}.` });
            }

            // Convert buffer data to base64 string for Cloudinary upload
            const base64Image = customLinkImageFile.data.toString('base64');
            const base64CustomLinkImage = `data:${customLinkImageFile.mimetype};base64,${base64Image}`;

            // Upload custom link image to Cloudinary
            const result = await cloudinary.uploader.upload(base64CustomLinkImage, {
              folder: 'zaplink/custom_link_images', // Cloudinary folder
              resource_type: 'auto',
            });
            linkImageUrl = result.secure_url;
            linkImagePublicId = result.public_id;
            console.log(`Custom link image uploaded for index ${index}:`, linkImageUrl, linkImagePublicId);
          } catch (uploadError) {
            console.error(`Cloudinary custom link image upload error for link ${index + 1}:`, uploadError);
            // If an upload fails here, you might want to return an error,
            // or proceed without the image, depending on your app's requirements.
            // For now, it will proceed and linkImageUrl/linkImagePublicId will remain empty on error.
            // If you want to block the request on error, uncomment the line below:
            // return res.status(500).json({ success: false, message: `Failed to upload image for link ${index + 1}.` });
          }
        } else {
          console.log(`No custom link image file provided for link at index ${index} (optional for 'Custom' links if no new image selected).`);
        }
      } else {
        console.log(`Link platform is not 'Custom' for index ${index}. Image upload logic for this link skipped.`);
      }

      // Push the processed link data to the array
      processedLinks.push({
        title: link.title,
        url: link.url,
        type: link.platform, // IMPORTANT: Ensure this is 'link.platform' to match the frontend logic
        icon: link.icon,
        linkImage: linkImageUrl, // This will be the Cloudinary URL or an empty string
        linkImagePublicId: linkImagePublicId // This will be the Cloudinary public ID or an empty string
      });
    }

    // Define the frontend base URL for constructing the Zap Link page URL
    const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://agentsync-5ab53.web.app';
    const linkPageUrl = `${FRONTEND_BASE_URL}/zaplink/${username}`;

    // Check if the username is already taken in Firestore
    const linkPageRef = db.collection('linkPages').doc(username);
    const linkPageSnap = await linkPageRef.get();

    if (linkPageSnap.exists) {
      return res.status(409).json({ success: false, message: 'Username already taken. Please choose a different one.' });
    }

    // --- DEBUGGING: Log processedLinks right before saving to DB ---
    console.log('--- Backend: processedLinks before DB save ---');
    console.log(JSON.stringify(processedLinks, null, 2)); // Pretty print JSON for readability
    console.log('---------------------------------------------');
    // --- END DEBUGGING ---

    // Save the Zap Link data to Firestore
    await linkPageRef.set({
      uid, // User ID from authentication
      username,
      bio: bio || '', // Ensure bio is a string, default to empty
      profilePicUrl: profilePicUrl,
      profilePicPublicId: profilePicPublicId,
      links: processedLinks, // Array of processed links
      pageClicks: 0, // Initialize click count
      createdAt: new Date(), // Timestamp of creation
      updatedAt: new Date(), // Timestamp of last update
      linkPageUrl,
      template // Selected template
    });

    // Send a success response
    res.status(200).json({ success: true, message: 'Zap link created successfully.', linkPageUrl });
  } catch (error) {
    // General error handling for any unexpected issues
    console.error('Error in createZapLink (general catch):', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUserZaplinks = async (req, res, db) => {
  try {
    const uid = req.user.uid;

    if (!uid) {
      return res.status(400).json({ success: false, message: "User ID is required." });
    }

    const querySnapshot = await db.collection("linkPages")
      .where("uid", "==", uid)
      .get();

    const userZaplinks = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate().toISOString() || new Date().toISOString(),
    }));

    res.status(200).json({
      success: true,
      data: userZaplinks,
      message: "User zaplinks fetched successfully.",
    });
  } catch (error) {
    console.error('Error in getUserZaplinks:', error);
    res.status(500).json({ success: false, error: error.message || "Internal server error." });
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
