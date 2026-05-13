import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import companiesRouter from "./companies";
import applicationsRouter from "./applications";
import analyticsRouter from "./analytics";
import paymentsRouter from "./payments";
import notificationsRouter from "./notifications";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(companiesRouter);
router.use(applicationsRouter);
router.use(analyticsRouter);
router.use(paymentsRouter);
router.use(notificationsRouter);
router.use(aiRouter);

export default router;
