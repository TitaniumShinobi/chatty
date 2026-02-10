import { z } from "zod";
import twilio from "twilio";
import User from "./models/User.js";
import jwt from "jsonwebtoken";

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
const serviceSid = process.env.TWILIO_VERIFY_SID;

export async function requestOTP(req,res){
  const phone = z.string().regex(/^\+\d{8,15}$/).parse(req.body.phone);
  await client.verify.v2.services(serviceSid).verifications.create({ to: phone, channel: "sms" });
  res.json({ ok:true });
}

export async function verifyOTP(req,res){
  const { phone, code } = z.object({
    phone: z.string().regex(/^\+\d{8,15}$/),
    code: z.string().length(6)
  }).parse(req.body);

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
