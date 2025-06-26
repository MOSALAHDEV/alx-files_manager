// routes/index.js
import express from 'express';
import AppController   from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController  from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

const router = express.Router();

/* health & stats */
router.get('/status', AppController.getStatus);
router.get('/stats',  AppController.getStats);

/* users & auth */
router.post('/users',       UsersController.postNew);
router.get('/users/me',     UsersController.getMe);
router.get('/connect',      AuthController.getConnect);
router.get('/disconnect',   AuthController.getDisconnect);

/* files */
router.get('/files/:id/data', FilesController.getFile);     // keep first!
router.get('/files/:id',      FilesController.getShow);
router.get('/files',          FilesController.getIndex);
router.post('/files',         FilesController.postUpload);
router.put('/files/:id/publish',   FilesController.putPublish);
router.put('/files/:id/unpublish', FilesController.putUnpublish);

export default router;

