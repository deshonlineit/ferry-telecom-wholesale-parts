import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import productsRouter from "./products";
import accountRouter from "./account";
import cartRouter from "./cart";
import ordersRouter from "./orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(productsRouter);
router.use(accountRouter);
router.use(cartRouter);
router.use(ordersRouter);

export default router;
