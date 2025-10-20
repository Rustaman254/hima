import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./configs/db";
import authRouter from "./router/authRouter";
import userRouter from "./router/userManagementRouter";
import plansRouter from "./router/insurancePlansRoutes";
import policyRouter from "./router/policyRouter";
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const baseUrl = "/api/v1";
connectDB();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(baseUrl + "/auth", authRouter);
app.use(baseUrl + "/users", userRouter);
app.use(baseUrl + "/insurance", plansRouter);
app.use(baseUrl + "/insurance", policyRouter);
app.get("/", (req, res) => {
    res.send("Hello from the server!");
});
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
//# sourceMappingURL=app.js.map