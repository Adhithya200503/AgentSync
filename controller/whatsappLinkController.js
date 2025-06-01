import { auth, db } from "../utils/firebase.js";
import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import { Timestamp } from "firebase-admin/firestore";
import calculateExpiry from "../functions/getExpiryDurationCalculator.js";


export const createLink = async (req, res) => {
  const { phone, message, duration, customDomain } = req.body;
  const user = req.user;

  // Validate phone number
  if (!phone || !/^\d+$/.test(phone)) {
    return res.status(400).json({ error: "Invalid phone number" });
  }

  const code = uuidv4().slice(0, 6);
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message || "")}`;
  const base64DataUrl = await QRCode.toDataURL(waUrl);

  const expiryDuration = calculateExpiry(duration);
  const now = Timestamp.now();
  const expiresAt =
    expiryDuration !== null
      ? Timestamp.fromMillis(now.toMillis() + expiryDuration)
      : null;

  const urlData = {
    userId: user.uid,
    phone,
    message,
    waUrl,
    base64DataUrl,
    urlId: customDomain || code,
    expiresAt,
    createdAt: new Date().toISOString(),

    // Add creator as the only initial agent
    agents: [
      {
        isCreator: true,
        name: user.displayName || null,
        email: user.email || null,
        message: message,
        phone: phone,
        agentUid: user.uid,
        joinedAt: new Date().toISOString()
      }
    ],
    multiAgentEnabled: false, // Initially off
    routingStrategy: null     // Can be 'round-robin', 'least-used', etc. in future
  };



  let finalDocId = code;

  if (customDomain) {
    const customDocRef = db.collection("links").doc(customDomain);
    const customDocSnap = await customDocRef.get();

    if (customDocSnap.exists) {
      return res.status(400).json({ error: "Custom domain is already taken" });
    }

    finalDocId = customDomain;
  }

  await db.collection("links").doc(finalDocId).set(urlData);
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({
    shortUrl: `${baseUrl}/${finalDocId}`,
    uploadedData: urlData,
  });
};

export const redirectLink = async (req, res) => {
  try {
    const { code } = req.params;
    const linkRef = db.collection("links").doc(code);
    const doc = await linkRef.get();

    if (!doc.exists) return res.status(404).send("Link not found");

    const data = doc.data();

    // Check expiry (optional)
    if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
      await linkRef.delete();
      return res.status(410).send("Link has expired");
    }

    // Get user IP
    let ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "";

    // Handle localhost IPs (for testing)
     

    // Get geolocation info from ipwho.is
    const geoRes = await fetch(`https://ipwho.is/${ip}`);
    const geoData = await geoRes.json();

    if (!geoData.success) {
      console.log("Geo lookup failed", geoData.message);
    }

    const country = geoData.country || "Unknown";
    const city = geoData.city || "Unknown";

    // Prepare stats update
    const stats = data.stats || [];
    const overallCount = data.count || 0;

    // Update country stats
    const countryIndex = stats.findIndex(
      (c) => c.country.toLowerCase() === country.toLowerCase()
    );

    if (countryIndex > -1) {
      stats[countryIndex].count += 1;

      // Update city stats
      const cityIndex = stats[countryIndex].topCities.findIndex(
        (c) => c.city.toLowerCase() === city.toLowerCase()
      );

      if (cityIndex > -1) {
        stats[countryIndex].topCities[cityIndex].count += 1;
      } else {
        stats[countryIndex].topCities.push({ city, count: 1 });
      }

      // Sort cities desc and keep top 3
      stats[countryIndex].topCities.sort((a, b) => b.count - a.count);
      stats[countryIndex].topCities = stats[countryIndex].topCities.slice(0, 3);
    } else {
      stats.push({
        country,
        count: 1,
        topCities: [{ city, count: 1 }],
      });
    }

    // Assign agent logic
    let assignedAgent = null;
    let selectedIndex = undefined;

    if (data.multiAgentEnabled && Array.isArray(data.agents) && data.agents.length > 0) {
      // Round robin assignment
      const lastUsedIndex = data.lastUsedIndex ?? -1; // default -1 if undefined
      selectedIndex = (lastUsedIndex + 1) % data.agents.length;
      assignedAgent = data.agents[selectedIndex];
    } else {
      // Single agent assignment - find creator agent
      assignedAgent = (data.agents || []).find((agent) => agent.isCreator) || null;
    }

    if (!assignedAgent) {
      // Fallback to original waUrl if no agent assigned
      return res.redirect(data.waUrl);
    }

    // Track assignment count per agent
    const assignedEmail = assignedAgent.email || "unknown";

    // Prepare update data object for Firestore
    const updateData = {
      count: overallCount + 1,
      stats,
    };

    // If multi agent enabled, update lastUsedIndex
    if (selectedIndex !== undefined) {
      updateData.lastUsedIndex = selectedIndex;
    }

    // Increment assignment count per agent inside agentAssignment map
    const currentAssignmentCount =
      data.agentAssignment?.[assignedEmail]?.assignedCount || 0;

    updateData[`agentAssignment.${assignedEmail}.assignedCount`] = currentAssignmentCount + 1;

    // Optionally you can store other agent info if needed
    updateData[`agentAssignment.${assignedEmail}.agentUid`] =
      assignedAgent.agentUid || null;
    updateData[`agentAssignment.${assignedEmail}.name`] = assignedAgent.name || null;

    // Update Firestore document
    await linkRef.update(updateData);

    // Construct redirect URL to assigned agent's waUrl or build it dynamically
    // Assuming agents have phone and message fields:
    const phone = assignedAgent.phone || "";
    const message = encodeURIComponent(assignedAgent.message || data.message || "");
    const waUrl = `https://wa.me/${phone}?text=${message}`;

    return res.redirect(waUrl);
  } catch (err) {
    console.error("redirectLink error:", err);
    return res.status(500).send("Internal Server Error");
  }
};



export const getLinkData = async (req, res) => {
  const { code } = req.params;
  const docRef = db.collection("links").doc(code);
  const doc = await docRef.get();

  if (!doc.exists) {
    return res.status(404).send("Link not found");
  }

  const data = doc.data();

  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    await docRef.delete();
    return res.status(410).send("Link has expired");
  }

  return res.json(data);
};




export const addAgentToLink = async (req, res) => {
  const { linkId, phone, email, message, name, agentUid } = req.body;
  const user = req.user; // Authenticated creator

  // Validate required inputs
  if (!linkId || (!phone && !email && !name)) {
    return res.status(400).json({ error: "Link ID and phone or email or name required" });
  }

  try {
    const linkRef = db.collection("links").doc(linkId);
    const linkSnap = await linkRef.get();

    if (!linkSnap.exists) {
      return res.status(404).json({ error: "Link not found" });
    }

    const linkData = linkSnap.data();

    // Ensure the current user is the creator of the link
    if (!user || linkData.userId !== user.uid) {
      return res.status(403).json({ error: "You are not authorized to modify this link" });
    }

    const agents = linkData.agents || [];

    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedPhone = phone?.trim();

    // Prevent duplicate agent entries
    if (
      agents.some(
        (a) =>
          (normalizedEmail && a.email?.toLowerCase() === normalizedEmail) ||
          (normalizedPhone && a.phone === normalizedPhone)
      )
    ) {
      return res.status(400).json({ error: "Agent already assigned" });
    }

    // Validate agentUid if provided
    const validAgentUid = agentUid && typeof agentUid === "string" ? agentUid : null;

    const newAgent = {
      isCreator: false,
      name: name?.trim() || "unknown",
      email: normalizedEmail || null,
      phone: normalizedPhone || null,
      message: message?.trim() || "",
      agentUid: validAgentUid,
      joinedAt: Timestamp.now().toDate()
    };

    agents.push(newAgent);

    await linkRef.update({ agents });

    return res.json({ message: "Agent added successfully", agent: newAgent });
  } catch (error) {
    console.error("Error adding agent:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


export const deleteAgentFromLink = async (req, res) => {
  const { linkId, index } = req.body;
  const user = req.user;

  if (!linkId || typeof index !== 'number') {
    return res.status(400).json({ error: "Link ID and valid index required" });
  }

  try {
    const linkRef = db.collection("links").doc(linkId);
    const snap = await linkRef.get();

    if (!snap.exists) return res.status(404).json({ error: "Link not found" });

    const linkData = snap.data();

    if (linkData.userId !== user.uid) return res.status(403).json({ error: "Unauthorized" });

    const updatedAgents = (linkData.agents || []).filter((_, i) => i !== index);

    await linkRef.update({ agents: updatedAgents });

    res.json({ message: "Agent removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
};



export const getAgentsFromLink = async (req, res) => {
  const { linkId } = req.query;
  const user = req.user;

  if (!linkId) {
    return res.status(400).json({ error: "Missing linkId" });
  }

  try {
    const linkRef = db.collection("links").doc(linkId);
    const snap = await linkRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Link not found" });
    }

    const linkData = snap.data();

    // Ensure the requester is the creator of the link
    if (linkData.userId !== user.uid) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    return res.status(200).json({
      multiAgentEnabled: linkData.multiAgentEnabled,
      agents: linkData.agents || [],
    });
  } catch (err) {
    console.error("Error fetching agents:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


export const toggleMultiAgentSupport = async (req, res) => {
  try {
    const { linkId, multiAgentEnabled } = req.body;

    if (typeof multiAgentEnabled !== "boolean" || !linkId) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const linkRef = db.collection("links").doc(linkId);
    const doc = await linkRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Link not found" });
    }
    const userId = req.user.uid;
    if (doc.data().userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Update multiAgentEnabled field
    await linkRef.update({
      multiAgentEnabled,
    });

    return res.json({ success: true, multiAgentEnabled });
  } catch (error) {
    console.error("Error toggling multiAgentEnabled:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}