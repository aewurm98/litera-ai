import { Resend } from "resend";

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error("Resend not connected");
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email,
  };
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || "Litera Health <care@litera.health>",
  };
}

// Email templates
export async function sendCarePlanEmail(
  toEmail: string,
  patientName: string,
  accessLink: string
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `${patientName}, your care instructions are ready`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="width: 60px; height: 60px; background: #1e40af; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
      <span style="font-size: 28px;">❤️</span>
    </div>
    <h1 style="color: #1e40af; margin: 0; font-size: 24px;">Litera.ai</h1>
    <p style="color: #64748b; margin: 8px 0 0;">Healthcare Companion</p>
  </div>
  
  <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px; color: #1e293b;">Hi ${patientName},</h2>
    <p style="margin: 0 0 16px;">Your care instructions from your recent hospital visit are now ready. These instructions have been simplified and translated for you.</p>
    <p style="margin: 0;">Click the button below to view your personalized care plan:</p>
  </div>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="${accessLink}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 18px;">
      View My Care Plan
    </a>
  </div>
  
  <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="margin: 0; color: #92400e; font-size: 14px;">
      <strong>Important:</strong> You will need to verify your identity by entering your year of birth.
    </p>
  </div>
  
  <p style="color: #64748b; font-size: 14px; margin: 24px 0;">
    If you have any questions or concerns, please contact your care team directly.
  </p>
  
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  
  <p style="color: #94a3b8; font-size: 12px; text-align: center;">
    This message was sent by Litera.ai on behalf of your healthcare provider.
    <br>Please do not reply to this email.
  </p>
</body>
</html>
      `,
    });
    
    return result;
  } catch (error) {
    console.error("Failed to send care plan email:", error);
    throw error;
  }
}

export async function sendCheckInEmail(
  toEmail: string,
  patientName: string,
  accessLink: string,
  attemptNumber: number
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const subject = attemptNumber === 1 
      ? `${patientName}, how are you feeling today?`
      : `${patientName}, we haven't heard from you`;
    
    const result = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="width: 60px; height: 60px; background: #1e40af; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
      <span style="font-size: 28px;">❤️</span>
    </div>
    <h1 style="color: #1e40af; margin: 0; font-size: 24px;">Litera.ai</h1>
  </div>
  
  <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 16px; color: #1e293b;">Hi ${patientName},</h2>
    <p style="margin: 0 0 16px;">We're checking in to see how you're doing after your recent hospital visit.</p>
    <p style="margin: 0;">Please take a moment to let us know how you're feeling:</p>
  </div>
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="${accessLink}" style="display: inline-block; background: #10b981; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 18px;">
      Check In Now
    </a>
  </div>
  
  <p style="color: #64748b; font-size: 14px; margin: 24px 0; text-align: center;">
    Your response helps your care team ensure you're recovering well.
  </p>
  
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  
  <p style="color: #94a3b8; font-size: 12px; text-align: center;">
    This message was sent by Litera.ai on behalf of your healthcare provider.
  </p>
</body>
</html>
      `,
    });
    
    return result;
  } catch (error) {
    console.error("Failed to send check-in email:", error);
    throw error;
  }
}
