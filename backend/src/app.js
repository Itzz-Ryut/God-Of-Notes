import express from "express";
import cors from "cors";
import helmet from "helmet";

import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";
import AppError from "./errors/AppError.js";
import asyncHandler from "./middleware/asyncHandler.js";

import authRoutes from "./modules/auth/auth.routes.js";

import usersRoutes from "./modules/users/users.routes.js";

import documentsRoutes from "./modules/documents/documents.routes.js";

import authorizationRoutes from "./modules/authorization/authorization.routes.js"

import workspacesRoutes from "./modules/workspaces/workspaces.routes.js"

import cookieParser from "cookie-parser";

import env from "./config/env.js";
import verifyOrigin from "./middleware/originCheck.js";
import { log } from "console";

const app = express();
app.set("trust proxy", 1);

app.use(helmet());

app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
}));


app.use(express.json());
app.use(cookieParser())
app.use(verifyOrigin)

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "god-of-notes-backend",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);

app.use("/api/documents", documentsRoutes);

app.use("/api/authorization", authorizationRoutes);

app.use("/api/workspaces", workspacesRoutes);

app.use(notFound);

app.use(errorHandler);


export default app;