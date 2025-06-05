import { db } from "../utils/firebase.js";


export const createPortFolio = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const {
      name,
      age,
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
      imageGallery,
      profession,
      customFields = {}
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
      email,
      socialMediaLinks: Array.isArray(socialMediaLinks) ? socialMediaLinks : [],
      city: city || "",
      country: country || "",
      description: description || "",
      achievements: Array.isArray(achievements) ? achievements : [],
      domain,
      certificates: Array.isArray(certificates) ? certificates : [],
      projects: Array.isArray(projects) ? projects : [],
      imageGallery: Array.isArray(imageGallery) ? imageGallery : [],
      profession,
      customFields: typeof customFields === "object" ? customFields : {},
      createdAt: new Date(),
    };

    const docRef = await db.collection("portfolios").add(portfolioData);

    res.status(200).json({
      success: true,
      message: "Portfolio created successfully.",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Error creating portfolio:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};




export const editPortFolio = async (req, res) => {
  try {
    const { id } = req.params; // Portfolio document ID
    const {
      name,
      age,
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
      imageGallery,
      profession,
      customFields = {}
    } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Portfolio ID is required." });
    }

    const updateData = {
      ...(name && { name }),
      ...(age !== undefined && { age }),
      ...(phoneNumber && { phoneNumber }),
      ...(email && { email }),
      ...(domain && { domain }),
      ...(profession && { profession }),
      ...(city && { city }),
      ...(country && { country }),
      ...(description && { description }),
      ...(Array.isArray(socialMediaLinks) && { socialMediaLinks }),
      ...(Array.isArray(achievements) && { achievements }),
      ...(Array.isArray(certificates) && { certificates }),
      ...(Array.isArray(projects) && { projects }),
      ...(Array.isArray(imageGallery) && { imageGallery }),
      ...(typeof customFields === "object" && { customFields }),
      updatedAt: new Date()
    };

    const portfolioRef = db.collection("portfolios").doc(id);
    const doc = await portfolioRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Portfolio not found." });
    }

    await portfolioRef.update(updateData);

    res.status(200).json({
      success: true,
      message: "Portfolio updated successfully.",
    });
  } catch (error) {
    console.error("Error updating portfolio:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
