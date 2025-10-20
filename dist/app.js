"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const db_1 = require("./configs/db");
const authRouter_1 = __importDefault(require("./router/authRouter"));
const userManagementRouter_1 = __importDefault(require("./router/userManagementRouter"));
const insurancePlansRoutes_1 = __importDefault(require("./router/insurancePlansRoutes"));
const policyRouter_1 = __importDefault(require("./router/policyRouter"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const baseUrl = "/api/v1";
const corsOptions = {
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
(0, db_1.connectDB)();
app.use((0, morgan_1.default)("dev"));
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(baseUrl + "/auth", authRouter_1.default);
app.use(baseUrl + "/users", userManagementRouter_1.default);
app.use(baseUrl + "/insurance", insurancePlansRoutes_1.default);
app.use(baseUrl + "/insurance", policyRouter_1.default);
app.get("/", (req, res) => {
    res.send("Hello from the server!");
});
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
//# sourceMappingURL=app.js.map