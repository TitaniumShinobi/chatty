// server/routes/files.js
import express from "express";
import jwt from "jsonwebtoken";
import AWS from "aws-sdk";
import crypto from "crypto";
import File from "../models/File.js";

const s3 = new AWS.S3({ 
  region: process.env.AWS_REGION,
  credentials: { 
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
  }
});

const r = express.Router();

r.use((req,res,next)=>{ 
  try{ 
    req.user=jwt.verify(req.cookies.auth,process.env.JWT_SECRET); 
    next(); 
  }catch{ 
    res.status(401).end(); 
  }
});

r.post("/sign", async (req,res)=>{
  const { name, mime, bytes, sha256 } = req.body;
  const key = `u/${req.user.id}/${Date.now()}-${encodeURIComponent(name)}`;
  const url = await s3.getSignedUrlPromise("putObject", { 
    Bucket: process.env.S3_BUCKET, 
    Key: key, 
    ContentType: mime, 
    ACL:"private" 
  });
  await File.create({ userId:req.user.id, key, name, mime, bytes, sha256 });
  res.json({ url, key });
});

r.get("/download/:id", async (req,res)=>{
  const f = await File.findOne({ _id:req.params.id, userId:req.user.id });
  if (!f) return res.status(404).end();
  const url = await s3.getSignedUrlPromise("getObject", { 
    Bucket: process.env.S3_BUCKET, 
    Key: f.key, 
    Expires: 60 
  });
  res.json({ url });
});

export default r;
