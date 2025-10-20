import express from "express";
import dotenv from "dotenv";
import cors from 'cors'
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./configs/db";
import authRouter from "./router/authRouter";
import userRouter from "./router/userManagementRouter"
import plansRouter from "./router/insurancePlansRoutes"
import policyRouter from "./router/policyRouter"

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const baseUrl = "/api/v1";
const corsOptions: cors.CorsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || 'https://hima-g018.onrender.com'
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'],
  
  credentials: true,
  
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  
  exposedHeaders: ['Content-Length', 'X-JSON-Response-Body'],
  
  maxAge: 86400, 
  
  optionsSuccessStatus: 200
};

connectDB();
app.use(morgan("dev"));
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(baseUrl + "/auth", authRouter);
app.use(baseUrl + "/users", userRouter);
app.use(baseUrl + "/insurance", plansRouter);
app.use(baseUrl + "/insurance", policyRouter);
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

app.get("/", (req, res) => {
  res.send("Hello from the server!");
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});