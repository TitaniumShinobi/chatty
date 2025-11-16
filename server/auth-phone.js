import { z } from "zod";
import User from "./models/User.js";
import jwt from "jsonwebtoken";
import twilio from "twilio";

// Only initialize Twilio if properly configured
let client, serviceSid;
if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_VERIFY_SID) {
  try {
    client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    serviceSid = process.env.TWILIO_VERIFY_SID;
  } catch (error) {
    console.error('Failed to initialize Twilio client:', error);
  }
} else {
  console.warn('Twilio credentials not fully configured; phone verification disabled.');
}

export async function requestOTP(req,res){
  const phone = z.string().regex(/^\+\d{8,15}$/).parse(req.body.phone);
  
  if (!client || !serviceSid) {
    return res.status(503).json({ error: 'SMS verification not available. Twilio not configured.' });
  }
  
  await client.verify.v2.services(serviceSid).verifications.create({ to: phone, channel: "sms" });
  res.json({ ok:true });
}

export async function verifyOTP(req,res){
  const { phone, code } = z.object({
    phone: z.string().regex(/^\+\d{8,15}$/),
    code: z.string().length(6)
  }).parse(req.body);

  if (!client || !serviceSid) {
    return res.status(503).json({ error: 'SMS verification not available. Twilio not configured.' });
  }

  const out = await client.verify.v2.services(serviceSid).verificationChecks.create({ to: phone, code });
  if (out.status !== "approved") return res.status(400).json({ error:"bad_code" });

  // attach phone to current user (from JWT cookie)
  try{
    const t = req.cookies?.auth; if (!t) return res.status(401).end();
    const payload = jwt.verify(t, process.env.JWT_SECRET);
    const user = await User.findByIdAndUpdate(payload.id, { phoneE164: phone, phoneVerifiedAt: new Date() }, { new:true });
    res.json({ ok:true, phone: user.phoneE164 });
  }catch{ res.status(401).end(); }
}
