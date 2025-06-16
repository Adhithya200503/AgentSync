import jwt from "jsonwebtoken";

const verifyAuth = (req, res, next) => {
    const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key";
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Missing or invalid token" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};

export default verifyAuth