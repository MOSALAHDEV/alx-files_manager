import express from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

const router = express.Router();

/* system */
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

/* users / auth */
router.post('/users', UsersController.postNew);
router.get('/users/me', UsersController.getMe);
router.get('/connect', AuthController.getConnect);
router.get('/disconnect', AuthController.getDisconnect);

/* files (tasks 6 – 8) */
router.post('/files', FilesController.postUpload);               // task 5
router.get('/files/:id', FilesController.getShow);               // task 6
router.get('/files', FilesController.getIndex);                  // task 6
router.put('/files/:id/publish', FilesController.putPublish);    // task 7
router.put('/files/:id/unpublish', FilesController.putUnpublish);// task 7
router.get('/files/:id/data', FilesController.getFile);          // task 8

export default router;

