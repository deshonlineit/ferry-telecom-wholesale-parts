import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import productsRouter from "./products";
import accountRouter from "./account";
import cartRouter from "./cart";
import ordersRouter from "./orders";
import smartSearchRouter from "./smart-search";
import storageRouter from "./storage";
import adminRouter from "./admin";
import stripeRouter from "./stripe";
import picqerRouter from "./picqer";
import walleeRouter from "./wallee";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(productsRouter);
router.use(accountRouter);
router.use(cartRouter);
router.use(ordersRouter);
router.use(smartSearchRouter);
router.use(storageRouter);
router.use(adminRouter);
router.use(stripeRouter);
router.use(picqerRouter);
router.use(walleeRouter);

export default router;
