// routes/index.js
import express from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

const router = express.Router();

/* ---------- App ---------- */
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

/* ---------- Users ---------- */
router.post('/users', UsersController.postNew);
router.get('/users/me', UsersController.getMe);

/* ---------- Auth ---------- */
router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);

/* ---------- Files ---------- */
router.post('/files', FilesController.postUpload); // Upload a file / create folder
router.get('/files/:id', FilesController.getShow); // Retrieve one file by ID
router.get('/files', FilesController.getIndex); // List files with pagination

export default router;
