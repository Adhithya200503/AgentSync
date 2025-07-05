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


export const uploadBackgroundVideo = async (req, res) => {
  try {
    const file = req.files?.video;

    if (!file) {
      return res.status(400).json({ success: false, message: "No video file provided." });
    }

     const result = await cloudinary.uploader.upload(file.tempFilePath, {
      resource_type: "video",
      folder: "zaplink_videos",
    });

    return res.status(200).json({ success: true, videoUrl: result.secure_url ,publicId: result.public_id, });
  } catch (error) {
    console.error("Upload error:", error);
    return res.status(500).json({ success: false, message: "Video upload failed." });
  }
};

export const deleteBackgroundVideo = async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ success: false, message: "Missing publicId." });
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "video",
    });

    if (result.result === "ok") {
      return res.status(200).json({ success: true, message: "Video deleted successfully." });
    } else {
      return res.status(400).json({ success: false, message: "Video deletion failed." });
    }
  } catch (error) {
    console.error("Deletion error:", error);
    return res.status(500).json({ success: false, message: "Error deleting video." });
  }
};

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
        // Authenticated user ID from middleware
        const uid = req.user.uid;

        // Extract data from request body
        const { username, bio, template } = req.body;

        // Files are available via req.files (assuming express-fileupload or similar middleware)
        const profilePicFile = req.files?.profilePic;

        // Initialize variables for profile picture
        let profilePicUrl = '';
        let profilePicPublicId = '';

        // --- 1. Validate Username ---
        if (!username || typeof username !== 'string' || username.trim() === '') {
            return res.status(400).json({ success: false, message: 'Username is required and must be a non-empty string.' });
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
            return res.status(400).json({ success: false, message: 'Username can only contain alphanumeric characters, underscores, hyphens, and periods.' });
        }
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ success: false, message: 'Username must be between 3 and 30 characters long.' });
        }

        // --- 2. Check Username Uniqueness ---
        const linkPageRef = db.collection('linkPages').doc(username.trim());
        const linkPageSnap = await linkPageRef.get();

        if (linkPageSnap.exists) {
            return res.status(409).json({ success: false, message: 'Username already taken. Please choose a different one.' });
        }

        // --- 3. Validate Bio ---
        if (typeof bio !== 'string') {
            return res.status(400).json({ success: false, message: 'Bio must be a string.' });
        }
        if (bio.length > 250) {
            return res.status(400).json({ success: false, message: 'Bio cannot exceed 250 characters.' });
        }

        // --- 4. Handle Profile Picture Upload (if provided) ---
        if (profilePicFile) {
            try {
                // --- CORRECTED VALIDATION FOR express-fileupload with useTempFiles ---
                if (
                    !profilePicFile.tempFilePath || // Check if the temporary file path exists
                    !profilePicFile.mimetype ||      // Check for mimetype
                    profilePicFile.size === 0        // Check file size (0 bytes means empty)
                ) {
                    console.error('Validation failed for profile picture file. Details:');
                    console.error('  - profilePicFile.tempFilePath exists:', !!profilePicFile.tempFilePath);
                    console.error('  - profilePicFile.mimetype:', profilePicFile.mimetype);
                    console.error('  - profilePicFile.size:', profilePicFile.size);
                    return res.status(400).json({ success: false, message: 'Invalid or empty profile picture file.' });
                }

                // --- Upload directly from temporary file path to Cloudinary ---
                const result = await cloudinary.uploader.upload(profilePicFile.tempFilePath, {
                    folder: 'zaplink/profile_pictures', // Cloudinary folder
                    resource_type: 'auto', // Automatically detect file type
                });

                profilePicUrl = result.secure_url;
                profilePicPublicId = result.public_id;
                console.log('Profile picture uploaded:', profilePicUrl, profilePicPublicId);
            } catch (uploadError) {
                console.error('Cloudinary profile picture upload error:', uploadError);
                return res.status(500).json({ success: false, message: 'Failed to upload profile picture.' });
            }
        }

        // --- 5. Handle Links ---
        let links = [];
        if (req.body.links) {
            try {
                links = JSON.parse(req.body.links);
            } catch (parseError) {
                console.error('Error parsing links JSON:', parseError);
                return res.status(400).json({ success: false, message: 'Invalid links data format.' });
            }
        }

        if (!Array.isArray(links) || links.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one link is required.' });
        }

        const processedLinks = [];
        const urlRegex = /^(https?|mailto|tel|sms|whatsapp):\/\/[^\s$.?#].[^\s]*$/i;

        for (const [index, link] of links.entries()) {
            // Default values if not provided or empty
            const linkPlatform = (typeof link.platform === 'string' && link.platform.trim() !== '')
                ? link.platform.trim()
                : PLATFORMS[0].name; // Use first platform as default

            const linkTitle = (typeof link.title === 'string' && link.title.trim() !== '')
                ? link.title.trim()
                : PLATFORMS.find(p => p.name === linkPlatform)?.name || 'Link'; // Default to platform name or 'Link'

            const linkUrl = (typeof link.url === 'string' && link.url.trim() !== '')
                ? link.url.trim()
                : '';

            const linkIcon = (typeof link.icon === 'string' && link.icon.trim() !== '')
                ? link.icon.trim()
                : linkPlatform.toLowerCase();

            // Link-specific validation
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
            const customLinkImageFile = req.files?.[`linkImage_${index}`]; // Access by dynamic name

            if (customLinkImageFile) {
                try {
                    // --- CORRECTED VALIDATION FOR CUSTOM LINK IMAGES ---
                    if (
                        !customLinkImageFile.tempFilePath ||
                        !customLinkImageFile.mimetype ||
                        customLinkImageFile.size === 0
                    ) {
                        console.error(`Validation failed for link image file at index ${index}.`);
                        return res.status(400).json({ success: false, message: `Invalid or empty image for link ${index + 1}.` });
                    }

                    // --- Upload directly from temporary file path to Cloudinary ---
                    const result = await cloudinary.uploader.upload(customLinkImageFile.tempFilePath, {
                        folder: 'zaplink/link_images', // Cloudinary folder for link images
                        resource_type: 'auto',
                    });
                    linkImageUrl = result.secure_url;
                    linkImagePublicId = result.public_id;
                } catch (uploadError) {
                    console.error(`Cloudinary link image upload error for link ${index + 1}:`, uploadError);
                    return res.status(500).json({ success: false, message: `Failed to upload image for link ${index + 1}.` });
                }
            }

            processedLinks.push({
                id: uuidv4(),  
                title: linkTitle,
                url: linkUrl,
                type: linkPlatform,  
                icon: linkIcon,
                linkImage: linkImageUrl,
                linkImagePublicId: linkImagePublicId,
                isActive:true
            });
        }

        
        const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'https://agentsync-5ab53.web.app';
        const linkPageUrl = `${FRONTEND_BASE_URL}/zaplink/${username.trim()}`;

        const newLinkPageData = {
            uid, // User ID
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
        };

       
        await linkPageRef.set(newLinkPageData);

     
        res.status(200).json({ success: true, message: 'Zap link created successfully.', linkPageUrl });

    } catch (error) {
        console.error('Error in createZapLink (general catch):', error);
        res.status(500).json({ success: false, error: error.message || 'An unexpected error occurred.' });
    }
};

export const editZapLink = async (req, res) => {
  // Helper function to delete images/videos from Cloudinary
  const deleteCloudinaryImage = async (publicId) => {
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
        console.log("Cloudinary: Successfully deleted asset with publicId:", publicId);
      } catch (err) {
        console.error("Cloudinary: Error deleting asset with publicId:", publicId, err);
        // It's often good practice to log, but not necessarily fail the entire request
        // if deleting an old asset fails, as the new asset might still be uploaded successfully.
      }
    }
  };

  try {
    // Extract user ID from the request (assuming authentication middleware populates req.user)
    const uid = req.user.uid;
    const { username } = req.params; // Get username from URL parameters
    const { bio, template } = req.body; // Get bio and template from request body

    // Access uploaded files via req.files (provided by express-fileupload)
    const profilePicFile = req.files?.profilePic;
    // req.body.removeProfilePic will be a string "true" or "false" if sent from FormData
    const removeProfilePic = req.body.removeProfilePic === "true";

    console.log("--- editZapLink Request Start ---");
    console.log("Request User UID:", uid);
    console.log("Target Username:", username);
    console.log("Request Body (bio, template, removeProfilePic):", { bio, template, removeProfilePic });
    console.log("Request Files (profilePic, linkImages):", req.files); // Shows all files received

    // Basic validation for username
    if (!username || typeof username !== "string" || username.trim() === "") {
      console.error("Validation Error: Username is required in path.");
      return res.status(400).json({ success: false, message: "Username is required in path." });
    }

    // Reference to the Firestore document for the link page
    const pageRef = db.collection("linkPages").doc(username);
    const snap = await pageRef.get(); // Fetch the current state of the document

    // Check if the page exists
    if (!snap.exists) {
      console.error(`Firestore Error: Page with username '${username}' not found.`);
      return res.status(404).json({ success: false, message: "Page not found." });
    }

    const existing = snap.data(); // Get existing data
    console.log("Existing page data (uid, profilePicPublicId, links count):", {
      uid: existing.uid,
      profilePicPublicId: existing.profilePicPublicId,
      linksCount: existing.links ? existing.links.length : 0
    });

    // Authorization check: ensure the current user owns this page
    if (existing.uid !== uid) {
      console.error("Authorization Error: User UID mismatch. Existing:", existing.uid, "Requested:", uid);
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const updateData = { updatedAt: new Date() }; // Object to hold updates for Firestore

    // Update bio if provided and valid
    if (typeof bio === "string") {
      if (bio.length > 250) {
        console.error("Validation Error: Bio too long (max 250 chars).");
        return res.status(400).json({ success: false, message: "Bio too long." });
      }
      updateData.bio = bio.trim();
      console.log("Updating bio to:", updateData.bio);
    }

    // Update template if provided
    if (template !== undefined) {
      updateData.template = template;
      console.log("Updating template to:", updateData.template);
    }

    // --- Handle Profile Picture Update ---
    if (profilePicFile) {
      console.log("Profile picture file detected in request.");
      console.log(`Profile Pic File Details: name=${profilePicFile.name}, mimetype=${profilePicFile.mimetype}, size=${profilePicFile.size} bytes`);

      // Ensure that a temporary file path is available (it should be with useTempFiles: true)
      if (!profilePicFile.tempFilePath) {
        console.error("Upload Error: Profile picture file has no temporary path. Cannot upload.");
        return res.status(500).json({ success: false, message: "Failed to process profile picture file." });
      }

      // If an old profile pic exists, delete it from Cloudinary
      if (existing.profilePicPublicId) {
        console.log("Existing profile picture found. Attempting to delete old image:", existing.profilePicPublicId);
        await deleteCloudinaryImage(existing.profilePicPublicId);
      }

      // Upload the new profile picture using its temporary file path
      console.log(`Uploading new profile pic from tempFilePath: ${profilePicFile.tempFilePath}`);
      const uploaded = await cloudinary.uploader.upload(profilePicFile.tempFilePath, {
        folder: "zaplink/profile_pictures",
        resource_type: "auto", // Automatically detect file type (image/png, image/jpeg, etc.)
      });
      updateData.profilePicUrl = uploaded.secure_url;
      updateData.profilePicPublicId = uploaded.public_id;
      console.log("Profile picture uploaded successfully. URL:", updateData.profilePicUrl);

    } else if (removeProfilePic) {
      console.log("Request to remove profile picture detected.");
      // If remove flag is true and an old pic exists, delete it from Cloudinary
      if (existing.profilePicPublicId) {
        console.log("Existing profile picture found. Attempting to delete old image:", existing.profilePicPublicId);
        await deleteCloudinaryImage(existing.profilePicPublicId);
      }
      // Clear profile pic fields in Firestore
      updateData.profilePicUrl = "";
      updateData.profilePicPublicId = "";
      console.log("Profile picture fields cleared in database.");
    }

    // --- Handle Links Update ---
    // Only process links if the 'links' field is explicitly sent in the request body
    if (req.body.links !== undefined) {
      let links;
      try {
        links = JSON.parse(req.body.links); // Parse the JSON string of links
        console.log(`Parsed ${links.length} links from request body.`);
      } catch (e) {
        console.error("Validation Error: Invalid links format. Must be a JSON string.", e);
        return res.status(400).json({ success: false, message: "Invalid links format (must be a JSON string)." });
      }

      // Create a map of existing links for efficient lookup and tracking for deletion
      const existingLinkMap = new Map((existing.links || []).map(l => [l.id, l]));
      const processedLinks = []; // Array to store the updated/new links that will be saved

      for (const [index, link] of links.entries()) {
        // Destructure link properties, providing default values for 'type'
        const { id, title, url, type = "Website", icon, linkImagePublicId } = link;

        console.log(`\n--- Processing Link ${index} (ID: ${id || 'New Link'}) ---`);
        console.log(`Link Data: Title: "${title}", URL: "${url}", Type: "${type}"`);
        console.log(`Frontend sent linkImagePublicId: ${linkImagePublicId}`);


        // Basic validation for link URL
        if (!url || typeof url !== "string" || url.trim() === "") {
          console.error(`Validation Error: Link ${index + 1} (ID: ${id || 'New'}) missing URL.`);
          return res.status(400).json({ success: false, message: `Link ${index + 1} missing URL.` });
        }

        const prev = existingLinkMap.get(id); // Get the previous state of this link from Firestore
        let currentLinkImage = prev?.linkImage || ""; // Initialize with existing image URL
        let currentLinkPublicId = prev?.linkImagePublicId || ""; // Initialize with existing public ID

        const imgFile = req.files?.[`linkImage_${index}`]; // Check for a specific image file for this link (e.g., linkImage_0, linkImage_1)

        if (imgFile) {
          console.log(`Image file detected for link ${index}.`);
          console.log(`Link Image File Details: name=${imgFile.name}, mimetype=${imgFile.mimetype}, size=${imgFile.size} bytes`);
          console.log(`Link Image Temp File Path: ${imgFile.tempFilePath}`);

          // Ensure that a temporary file path is available
          if (!imgFile.tempFilePath) {
            console.error(`Upload Error: Link image ${index} file has no temporary path. Cannot upload.`);
            // If we can't get the temp path, we treat this as no new image for this link,
            // and fall back to existing or empty image details.
            currentLinkImage = prev?.linkImage || ""; // Keep previous if it exists
            currentLinkPublicId = prev?.linkImagePublicId || "";
          } else {
            // If an old image exists for this link, delete it from Cloudinary
            if (currentLinkPublicId) {
              console.log(`Existing image for link ${index} found. Attempting to delete old image: ${currentLinkPublicId}`);
              await deleteCloudinaryImage(currentLinkPublicId);
            }

            // Upload the new image for the link using its temporary file path
            console.log(`Uploading new image for link ${index} from tempFilePath: ${imgFile.tempFilePath}`);
            const result = await cloudinary.uploader.upload(imgFile.tempFilePath, {
              folder: "zaplink/link_images",
              resource_type: "auto",
            });
            currentLinkImage = result.secure_url;
            currentLinkPublicId = result.public_id;
            console.log(`Cloudinary upload successful for link ${index}. URL: ${currentLinkImage}`);
          }
        } else if (linkImagePublicId === "REMOVE") {
          console.log(`Request to remove image for link ${index} detected by "REMOVE" flag.`);
          // If the frontend explicitly sent "REMOVE" for the publicId in the link object
          if (currentLinkPublicId) {
            console.log(`Existing image for link ${index} found. Attempting to delete old image: ${currentLinkPublicId}`);
            await deleteCloudinaryImage(currentLinkPublicId);
          }
          currentLinkImage = ""; // Clear image URL
          currentLinkPublicId = ""; // Clear public ID
          console.log(`Image for link ${index} removed from database fields.`);
        }
        // Else (no new file, and linkImagePublicId is NOT "REMOVE"), keep existing image data if any.
        // This is implicitly handled by `currentLinkImage` and `currentLinkPublicId` initialized from `prev`.

        // Add the processed link to the array
        processedLinks.push({
          id: id || uuidv4(), // Use existing ID if provided, otherwise generate a new one for new links
          title: title?.trim() || "Link", // Trim title or default to "Link"
          url: url.trim(), // Trim URL
          type: type, // Keep the link type
          icon: icon || type.toLowerCase(), // Use provided icon or default based on type
          linkImage: currentLinkImage, // Updated or existing image URL
          linkImagePublicId: currentLinkPublicId, // Updated or existing public ID
        });
      }

      updateData.links = processedLinks; // Assign the processed links array to updateData
      console.log(`Final processed links array count for update: ${processedLinks.length}`);

      // Identify and delete images for links that were entirely removed from the new links array
      const removedIds = Array.from(existingLinkMap.keys()).filter(id =>
        !links.some(l => l.id === id) // Check if an existing link's ID is NOT present in the new links array
      );
      if (removedIds.length > 0) {
        console.log("Detected link IDs that were fully removed from the page:", removedIds);
        for (const id of removedIds) {
          const old = existingLinkMap.get(id); // Get the data of the removed link
          if (old?.linkImagePublicId) { // If it had an associated image
            console.log(`Deleting image for fully removed link (ID: ${id}): ${old.linkImagePublicId}`);
            await deleteCloudinaryImage(old.linkImagePublicId);
          }
        }
      } else {
        console.log("No links were fully removed from the page.");
      }
    } else {
        console.log("No 'links' array was provided in the request body. Skipping links update.");
    }

    // Perform the Firestore update operation with all accumulated changes
    await pageRef.update(updateData);
    console.log("Firestore: Page document updated successfully.");

    // Construct the full URL to the updated link page for the response
    const link = `${process.env.FRONTEND_BASE_URL || "https://yourapp.com"}/zaplink/${username}`;
    console.log("Response: Page updated successfully. Link URL:", link);
    return res.status(200).json({ success: true, message: "Page updated.", linkPageUrl: link });

  } catch (err) {
    console.error("editZapLink Caught Unexpected Error:", err); // Log the full error object for debugging

    // Provide more user-friendly messages for common errors if possible
    const errorMessage = err.message || "An unexpected error occurred during page update.";
    // Example: if you want to differentiate Cloudinary errors
    if (err.http_code && err.http_code >= 400 && err.http_code < 500) {
        return res.status(400).json({ success: false, error: `Cloudinary error: ${errorMessage}` });
    } else if (err.name === 'FirebaseError') {
        return res.status(500).json({ success: false, error: `Database error: ${errorMessage}` });
    }
    return res.status(500).json({ success: false, error: errorMessage });
  } finally {
      console.log("--- editZapLink Request End ---\n"); // Mark the end of the request processing
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
    templateName = null,
    baseTemplate = "default",
    isTemplateInUse,
    isTemplateInStore,
  } = req.body;

  if (!userId || typeof customizer !== "object") {
    return res.status(400).json({ success: false, message: "Invalid input." });
  }

  try {
    let docRef;
    let isNew = true;
    let updatePayload = {
      userId,
      customizer,
      isPublic,
      templateName,
      baseTemplate,
      isTemplateInUse,
      isTemplateInStore,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (templateId) {
      // If templateId is provided, it's an update operation
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

      // Ensure that only the owner can edit existing templates
      if (existingData.userId !== userId) {
        return res.status(403).json({ success: false, message: "Unauthorized to edit this template." });
      }

      isNew = false;
      // *** FIX HERE: When updating, DO NOT include `createdBy` in the updatePayload. ***
      // Since merge: true is used, its existing value will be preserved.
      delete updatePayload.createdBy; // Explicitly remove if it was somehow added earlier.
    } else {
      // If no templateId, it's a new creation
      docRef = db.collection("templates").doc();
      updatePayload.createdAt = admin.firestore.FieldValue.serverTimestamp();
      updatePayload.createdBy = userId; // Set createdBy only for new templates
    }

    await docRef.set(updatePayload, { merge: true });

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
   

  const userId = req.user.uid ;

  try {
    const templatesMap = new Map();

  
    const inStoreSnapshot = await db
      .collection("templates")
      .where("isTemplateInStore", "==", true)
      .get();

    inStoreSnapshot.docs.forEach((doc) => {
      templatesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    
    const defaultSnapshot = await db
      .collection("templates")
      .where(admin.firestore.FieldPath.documentId(), "in", DEFAULT_TEMPLATE_IDS)
      .get();

    defaultSnapshot.docs.forEach((doc) => {
      templatesMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

  
    if (userId) {
      const userSnapshot = await db
        .collection("templates")
        .where("createdBy", "==", userId)
        .get();

      userSnapshot.docs.forEach((doc) => {
        templatesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });
    }

    
    const mergedTemplates = Array.from(templatesMap.values());

    return res.status(200).json({ success: true, data: mergedTemplates });
  } catch (error) {
    console.error("Error fetching templates:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch templates.",
    });
  }
};

