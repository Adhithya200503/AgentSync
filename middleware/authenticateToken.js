import { auth } from "../utils/firebase.js";  

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - Missing Bearer token' });
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized - Token is empty' });
  }

  try {
    
    const decodedToken = await auth.verifyIdToken(idToken); 
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized - Invalid or expired token' });
  }
}

export default authenticateToken;