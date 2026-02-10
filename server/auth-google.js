import passport from "passport";
import { Strategy as Google } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import User from "./models/User.js";

const sign = (u)=> jwt.sign({ sub:u.sub, id:u._id, email:u.email, name:u.name, picture:u.picture, provider:"google" },
  process.env.JWT_SECRET,{ expiresIn:"7d" });

passport.use(new Google({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK
}, async (_a,_r,p,done)=>{
  const data = {
    sub: p.id,
    email: p.emails?.[0]?.value,
    name: p.displayName,
    picture: p.photos?.[0]?.value,
    provider: "google",
    emailVerified: true
  };
  const user = await User.findOneAndUpdate({ sub: data.sub }, data, { upsert: true, new: true });
  return done(null, { token: sign(user), id: user._id.toString() });
}));

passport.serializeUser((u,d)=>d(null,u)); 
passport.deserializeUser((u,d)=>d(null,u)); 

export default passport;
