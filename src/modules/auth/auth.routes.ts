import { Router } from "express";
import { auth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as authController from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.schema.js";

export const authRouter = Router();

authRouter.post("/register", validate({ body: registerSchema }), asyncHandler(authController.register));
authRouter.post("/login", validate({ body: loginSchema }), asyncHandler(authController.login));
authRouter.get("/me", auth, asyncHandler(authController.me));
