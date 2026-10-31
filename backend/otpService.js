const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const nodemailer = require('nodemailer');

/**
 * Send OTP via Email using Nodemailer (Gmail / SMTP)
 */
async function sendEmailOtp(email, otp) {
  if (!email) return false;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    console.log(`[EMAIL NOTICE] SMTP_USER or SMTP_PASS not set in .env. Email OTP (${otp}) was not sent over SMTP.`);
    return false;
  }

  try {
    const transportConfig = smtpUser.includes('@gmail.com')
      ? {
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass.replace(/\s+/g, '') // remove spaces from Gmail app passwords
          }
        }
      : {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT, 10) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        };

    const transporter = nodemailer.createTransport(transportConfig);

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Veer Garments" <veergarments2721@gmail.com>',
      replyTo: process.env.EMAIL_FROM || '"Veer Garments" <veergarments2721@gmail.com>',
      to: email,
      subject: `Your Veer Garments Verification OTP: ${otp}`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0a0a0c; color: #f5f5f7; padding: 35px 25px; border-radius: 12px; max-width: 500px; margin: 0 auto; border: 1px solid rgba(212, 175, 55, 0.3);">
          <div style="text-align: center; margin-bottom: 25px;">
            <h1 style="color: #f5f5f7; margin: 0; font-size: 26px; letter-spacing: 3px;">VEER <span style="color: #d4af37; font-style: italic;">Garments</span></h1>
            <p style="color: #8e8e93; font-size: 12px; margin-top: 5px; letter-spacing: 1px;">LUXURY GARMENTS & APPAREL</p>
          </div>
          
          <div style="background-color: #121216; border-radius: 10px; padding: 25px; border: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
            <p style="font-size: 14px; color: #d1d5db; margin: 0 0 15px 0;">Your One-Time Verification Code for creating your Veer Garments member account is:</p>
            <div style="display: inline-block; padding: 12px 28px; background: rgba(212, 175, 55, 0.12); border: 1px dashed #d4af37; border-radius: 8px; margin: 10px 0 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d4af37;">${otp}</span>
            </div>
            <p style="font-size: 12px; color: #8e8e93; margin: 0;">This code expires in <strong>5 minutes</strong>. For your security, never share this OTP with anyone.</p>
          </div>
          
          <p style="text-align: center; color: #555555; font-size: 11px; margin-top: 25px;">
            &copy; ${new Date().getFullYear()} Veer Garments, Manak Chowk, Ratlam.
          </p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SUCCESS] OTP email sent to ${email} (Message ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Failed to send email to ${email}:`, error.message);
    return false;
  }
}

/**
 * Send OTP via SMS (Fast2SMS for Indian numbers or Twilio)
 */
async function sendSmsOtp(phone, otp) {
  if (!phone) return { success: false, error: 'No phone number provided' };

  const cleanPhone = phone.toString().replace(/\D/g, '').slice(-10);

  // 1. Check Fast2SMS (popular in India)
  const fast2smsKey = process.env.FAST2SMS_API_KEY;
  if (fast2smsKey) {
    try {
      // If user has a Smart OTP ID configured
      if (process.env.FAST2SMS_OTP_ID) {
        const response = await fetch('https://www.fast2sms.com/dev/otp/send', {
          method: 'POST',
          headers: {
            'Authorization': fast2smsKey.trim(),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            otp_id: process.env.FAST2SMS_OTP_ID.trim(),
            mobile: cleanPhone,
            otp: otp
          })
        });
        const data = await response.json();
        if (data.return || data.status_code === 200 || data.status === 'success') {
          console.log(`[SMS SUCCESS] Fast2SMS Smart OTP sent to +91 ${cleanPhone}`);
          return { success: true };
        } else {
          const errorMsg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
          console.error(`[FAST2SMS SMART OTP NOTICE]:`, errorMsg);
          return { success: false, error: errorMsg };
        }
      }

      // Default Fast2SMS Bulk V2 OTP route
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': fast2smsKey.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'otp',
          variables_values: otp,
          numbers: cleanPhone
        })
      });
      const data = await response.json();
      if (data.return || data.status_code === 200) {
        console.log(`[SMS SUCCESS] Fast2SMS sent OTP to +91 ${cleanPhone}`);
        return { success: true };
      } else {
        const errorMsg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
        console.error(`[FAST2SMS NOTICE]:`, errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      console.error(`[FAST2SMS NETWORK ERROR]:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // 2. Check Twilio (Global SMS)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  if (twilioSid && twilioAuth && twilioPhone) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
      const body = new URLSearchParams({
        To: `+91${cleanPhone}`,
        From: twilioPhone,
        Body: `Your Veer Garments verification OTP is ${otp}. Valid for 5 minutes.`
      });

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });
      const data = await response.json();
      if (!response.ok) {
        console.error(`[TWILIO ERROR]:`, data.message);
        return { success: false, error: data.message };
      } else {
        console.log(`[SMS SUCCESS] Twilio sent SMS to +91 ${cleanPhone}`);
        return { success: true };
      }
    } catch (err) {
      console.error(`[TWILIO ERROR]:`, err.message);
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'No SMS gateway credentials configured' };
}

/**
 * Dispatch OTP across configured channels (SMS & Email)
 */
async function dispatchOtp({ phone, email, otp }) {
  console.log(`\n======================================================`);
  console.log(`[VEER GARMENTS OTP DISPATCH] Generating verification OTP for:`);
  if (phone) console.log(` - Mobile Phone: +91 ${phone}`);
  if (email) console.log(` - Email Inbox:  ${email}`);
  console.log(` - Generated OTP: >>> ${otp} <<<`);
  console.log(`======================================================\n`);

  let smsResult = { success: false };
  let emailResult = false;

  if (phone) {
    smsResult = await sendSmsOtp(phone, otp);
  }

  if (email) {
    emailResult = await sendEmailOtp(email, otp);
  }

  return { 
    smsSent: smsResult.success, 
    emailSent: emailResult === true,
    smsError: smsResult.error
  };
}

module.exports = {
  dispatchOtp,
  sendEmailOtp,
  sendSmsOtp
};
