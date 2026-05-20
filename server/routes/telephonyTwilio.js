import express from 'express';
import { createRequire } from 'module';
import twilio from 'twilio';
import { getChatService } from '../services/chatService.js';

const router = express.Router();
const require = createRequire(import.meta.url);
const telephonyMap = (() => {
  try {
    return require('../../config/telephony.json');
  } catch {
    return {};
  }
})();

const TWILIO_AUTH_TOKEN = process.env.TWILIO_TOKEN || process.env.TWILIO_AUTH_TOKEN || '';

function mapNumber(toNumber) {
  if (!toNumber) return null;
  return telephonyMap[String(toNumber)] || null;
}

function verifyTwilioSignature(req) {
  if (!TWILIO_AUTH_TOKEN) return false;
  try {
    const signature = req.headers['x-twilio-signature'];
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    return twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body || {});
  } catch {
    return false;
  }
}

router.post('/sms', express.urlencoded({ extended: false }), async (req, res) => {
  if (!verifyTwilioSignature(req)) {
    return res.status(403).send('invalid signature');
  }
  const { From, To, Body } = req.body || {};
  const mapping = mapNumber(To);
  if (!mapping || !Body) return res.status(200).send('<Response></Response>');

  try {
    const chatService = getChatService();
    await chatService.appendInboundMessage({
      threadId: mapping.smsThreadId,
      constructId: mapping.constructId,
      fromPhone: From,
      text: Body,
    });
    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    console.error('[Telephony][Twilio][SMS] error', err.message);
    res.type('text/xml').status(500).send('<Response></Response>');
  }
});

router.post('/voice', express.urlencoded({ extended: false }), async (req, res) => {
  if (!verifyTwilioSignature(req)) {
    return res.status(403).send('invalid signature');
  }
  const { To } = req.body || {};
  const mapping = mapNumber(To);
  if (!mapping) return res.type('text/xml').send('<Response></Response>');

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.gather({
    input: 'speech',
    speechTimeout: 'auto',
    action: '/api/telephony/twilio/voice/handle',
    method: 'POST',
  }).say('Nova speaking. After the tone, tell me what is happening.');
  res.type('text/xml').send(twiml.toString());
});

router.post('/voice/handle', express.urlencoded({ extended: false }), async (req, res) => {
  if (!verifyTwilioSignature(req)) {
    return res.status(403).send('invalid signature');
  }
  const { From, To, SpeechResult } = req.body || {};
  const mapping = mapNumber(To);
  if (!mapping || !SpeechResult) return res.type('text/xml').send('<Response></Response>');

  try {
    const chatService = getChatService();
    await chatService.appendInboundMessage({
      threadId: mapping.voiceThreadId,
      constructId: mapping.constructId,
      fromPhone: From,
      text: SpeechResult,
      inputMode: 'voice',
    });
  } catch (err) {
    console.error('[Telephony][Twilio][Voice] error', err.message);
  }

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('Thank you. Nova received your message.');
  res.type('text/xml').send(twiml.toString());
});

export default router;
