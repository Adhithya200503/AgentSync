import {  createOrUpdateTemplate, createZapLink, deleteZapLink, editZapLink, getAllTemplates, getAllUserTemplates, getAllUserZapLinks, getTemplateById} from "../controller/zapLinkControllers.js";
import express from "express"
const router = express.Router();

router.post('/link-page',createZapLink);
router.get('/get-user-zaplinks',getAllUserZapLinks);
router.put('/edit/:username',editZapLink);
router.delete('/delete/:username',deleteZapLink);
router.post("/template", createOrUpdateTemplate);
router.get("/template", getAllUserTemplates);
router.get("/all-templates",getAllTemplates);
// router.get("template/:templateId",getTemplateById);

export default router;