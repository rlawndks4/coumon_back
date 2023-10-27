import express from 'express';
import validate from 'express-validation';
import { productCtrl } from '../controllers/index.js';

const router = express.Router(); // eslint-disable-line new-cap

router
    .route('/')
    .get(productCtrl.list)
    .post(productCtrl.create);

router
    .route('/:id')
    .get(productCtrl.get)
    .put(productCtrl.update)
    .delete(productCtrl.remove)


export default router;
