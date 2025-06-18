import { db } from "../utils/firebase.js";

export const createPortFolio = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const {
      name,
      age,
      phoneNumber,
      email,
      profileImg,
      socialMediaLinks,
      city,
      country,
      description,
      achievements,
      domain,
      certificates,
      projects,
      profession,
      customFields = {},
      education,
      languages,
      resume,
      experience, 
      template = "default"
    } = req.body;

    if (!name || !phoneNumber || !domain || !profession || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, phoneNumber, domain, profession, or email.",
      });
    }

    const portfolioData = {
      userId,
      name,
      age: age || null,
      phoneNumber,
      profileImg: profileImg || "",
      email,
      socialMediaLinks: Array.isArray(socialMediaLinks) ? socialMediaLinks : [],
      city: city || "",
      country: country || "",
      description: description || "",
      achievements: Array.isArray(achievements) ? achievements : [],
      domain,
      certificates: Array.isArray(certificates) ? certificates : [],
      projects: Array.isArray(projects) ? projects : [],
      profession,
      customFields: typeof customFields === "object" ? customFields : {},
      education: Array.isArray(education) ? education : [],
      languages: Array.isArray(languages) ? languages : [],
      experience: Array.isArray(experience) ? experience : [], // NEW: Initialize experience field
      resume: resume || "",
      template,
      createdAt: new Date(),
    };

    const docRef = await db.collection("portfolios").add(portfolioData);
    const url = `https://ag-sync.web.app/${docRef.id}`; // Assuming this is your frontend URL
    await docRef.update({ url }); 

    res.status(200).json({
      success: true,
      message: "Portfolio created successfully.",
      id: docRef.id,
      url,
    });
  } catch (error) {
    console.error("Error creating portfolio:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};

export const editPortFolio = async (req, res) => {
  if (!req.user || !req.user.user_id) {
    return res.status(401).json({ success: false, message: "Unauthorized: User not authenticated." });
  }

  const user_id = req.user.user_id;

  try {
    const { id } = req.params;

    const {
      name,
      age,
      profileImg,
      phoneNumber,
      email,
      socialMediaLinks,
      city,
      country,
      description,
      achievements,
      domain,
      certificates,
      projects,
      profession,
      customFields = {},
      education,
      languages,
      resume,
      experience,  
      template
    } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Portfolio ID is required for editing." });
    }

    const portfolioRef = db.collection("portfolios").doc(id);
    const doc = await portfolioRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Portfolio not found." });
    }

    const portfolioOwnerId = doc.data().userId;

    if (user_id !== portfolioOwnerId) {
      return res.status(403).json({ success: false, message: "Forbidden: You are not the creator of this portfolio." });
    }

    const updateData = {
      ...(name !== undefined && { name }),
      ...(profileImg !== undefined && { profileImg }),
      ...(age !== undefined && { age }),
      ...(phoneNumber !== undefined && { phoneNumber }),
      ...(email !== undefined && { email }),
      ...(domain !== undefined && { domain }),
      ...(profession !== undefined && { profession }),
      ...(city !== undefined && { city }),
      ...(country !== undefined && { country }),
      ...(description !== undefined && { description }),
      ...(Array.isArray(socialMediaLinks) && { socialMediaLinks }),
      ...(Array.isArray(achievements) && { achievements }),
      ...(Array.isArray(certificates) && { certificates }),
      ...(Array.isArray(projects) && { projects }),
      ...(Array.isArray(education) && { education }),
      ...(Array.isArray(languages) && { languages }),
      ...(experience !== undefined && Array.isArray(experience) && { experience }), // NEW: Conditionally update experience
      ...(resume !== undefined && { resume }),
      ...(template !== undefined && { template }),
      ...(typeof customFields === "object" && { customFields }),
      updatedAt: new Date(),
    };

    if (req.body.userId && req.body.userId !== user_id) {

      return res.status(403).json({ success: false, message: "Forbidden: Cannot change portfolio ownership." });
    }

    await portfolioRef.update(updateData);

    res.status(200).json({
      success: true,
      message: "Portfolio updated successfully.",
    });
  } catch (error) {
    console.error("Error updating portfolio:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};

export const getPortfolio = async (req, res) => {
  try {
    const { portfolioId } = req.params;

    if (!portfolioId) {
      return res.status(400).json({ success: false, message: "Missing portfolio ID." });
    }

    const docRef = db.collection("portfolios").doc(portfolioId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ success: false, message: "Portfolio not found." });
    }

    res.status(200).json({ success: true, data: docSnap.data() });
  } catch (error) {
    console.error("Error fetching portfolio:", error);
    res.status(500).json({ success: false, message: "Server error: " + error.message });
  }
};
