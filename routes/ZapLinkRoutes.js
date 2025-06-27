import {  createOrUpdateTemplate, createZapLink, deleteZapLink, editZapLink, getAllUserTemplates, getAllUserZapLinks, getTemplateById} from "../controller/zapLinkControllers.js";
import express from "express"
const router = express.Router();

router.post('/link-page',createZapLink);
router.get('/get-user-zaplinks',getAllUserZapLinks);
router.put('/edit/:username',editZapLink);
router.delete('/delete/:username',deleteZapLink);
router.post("/template", createOrUpdateTemplate);
router.get("/template", getAllUserTemplates);
// router.get("template/:templateId",getTemplateById);

export default router;