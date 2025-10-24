import multer, { FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";
import type {Response, Request as Req} from 'express';

// create upload folder if it doesn't exist
const uploadDir = path.resolve("uploads", "claims");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// configure file storage
const storage = multer.diskStorage({
  destination: (_req: Req, _file, cb) => cb(null, uploadDir),
  filename: (_req: Req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

// restrict uploads to images only
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files are allowed"));
};

// initialize multer with limits and types
export const uploadProofImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10 MB × 10 files
}).array("supportingDocuments", 10);
