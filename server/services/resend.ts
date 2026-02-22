import { Resend } from "resend";

let connectionSettings: any;

async function getCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  if (process.env.RESEND_API_KEY) {
    console.log("[Resend] Using direct RESEND_API_KEY");
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL || "Litera Health <onboarding@resend.dev>",
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken || !hostname) {
    console.error("[Resend] Missing connector env vars:", {
      hasHostname: !!hostname,
      hasReplIdentity: !!process.env.REPL_IDENTITY,
      hasWebReplRenewal: !!process.env.WEB_REPL_RENEWAL,
    });
    throw new Error(
      "Email service not configured. Set RESEND_API_KEY for direct Resend access, " +
      "or ensure Replit connector environment variables are available."
    );
  }

  console.log("[Resend] Fetching credentials from Replit connector...");
  const connectorUrl = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`;
  
  try {
    const response = await fetch(connectorUrl, {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Resend] Connector API returned ${response.status}: ${errorText}`);
      throw new Error(`Connector API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    connectionSettings = data.items?.[0];

    if (!connectionSettings) {
      console.error("[Resend] No connection found in connector response:", JSON.stringify(data));
      throw new Error("Resend not connected — no connection items returned from connector API");
    }

    if (!connectionSettings.settings?.api_key) {
      console.error("[Resend] Connection found but no api_key in settings:", 
        JSON.stringify({ hasSettings: !!connectionSettings.settings, settingKeys: Object.keys(connectionSettings.settings || {}) }));
      throw new Error("Resend connection found but api_key is missing from settings");
    }

    console.log("[Resend] Credentials obtained successfully, from_email:", connectionSettings.settings.from_email);
    return {
      apiKey: connectionSettings.settings.api_key,
      fromEmail: connectionSettings.settings.from_email,
    };
  } catch (error: any) {
    if (error.message.includes("Resend")) throw error;
    console.error("[Resend] Failed to fetch connector credentials:", error.message);
    throw new Error(`Failed to fetch Resend credentials from connector: ${error.message}`);
  }
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || "Litera Health <onboarding@resend.dev>",
  };
}

// Email templates
export async function sendCarePlanEmail(
  toEmail: string,
  patientName: string,
  accessLink: string,
  pin?: string
) {
  console.log(`[Resend] === Starting care plan email send ===`);
  console.log(`[Resend] To: ${toEmail}, Patient: ${patientName}`);
  console.log(`[Resend] Access link: ${accessLink}`);
  
  const { client, fromEmail } = await getUncachableResendClient();
  
  const pinSection = pin ? `
  <div style="background: #dbeafe; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="margin: 0 0 8px; color: #1e40af; font-size: 14px; font-weight: 600;">
      Your Secure Access PIN
    </p>
    <p style="margin: 0; color: #1e40af; font-size: 32px; font-weight: 700; letter-spacing: 4px; text-align: center;">
      ${pin}
    </p>
    <p style="margin: 8px 0 0; color: #1e40af; font-size: 12px; text-align: center;">
      Keep this PIN private. You'll need it along with your last name and year of birth.
    </p>
  </div>
` : '';

  const verificationInstructions = pin 
    ? `<strong>Important:</strong> You will need to verify your identity by entering your last name, year of birth, and the PIN shown above.`
    : `<strong>Important:</strong> You will need to verify your identity by entering your year of birth.`;
  
  console.log(`[Resend] Sending email from: ${fromEmail}`);
  
  try {
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
  
  ${pinSection}
  
  <div style="text-align: center; margin: 32px 0;">
    <a href="${accessLink}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 18px;">
      View My Care Plan
    </a>
  </div>
  
  <div style="background: #fef3c7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
    <p style="margin: 0; color: #92400e; font-size: 14px;">
      ${verificationInstructions}
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
    
    console.log(`[Resend] Care plan email sent successfully:`, JSON.stringify(result));
    
    if (result?.error) {
      console.error(`[Resend] API returned error in result:`, JSON.stringify(result.error));
      throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
    }
    
    return result;
  } catch (error: any) {
    console.error(`[Resend] === Email send FAILED ===`);
    console.error(`[Resend] Error type: ${error?.constructor?.name}`);
    console.error(`[Resend] Error message: ${error?.message}`);
    console.error(`[Resend] Status code: ${error?.statusCode}`);
    console.error(`[Resend] Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw error;
  }
}

export async function sendCheckInEmail(
  toEmail: string,
  patientName: string,
  accessLink: string,
  attemptNumber: number
) {
  console.log(`[Resend] Sending check-in email to: ${toEmail}`);
  
  const { client, fromEmail } = await getUncachableResendClient();
  
  const subject = attemptNumber === 1 
    ? `${patientName}, how are you feeling today?`
    : `${patientName}, we haven't heard from you`;
  
  try {
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
    
    if (result?.error) {
      console.error(`[Resend] Check-in email API returned error:`, JSON.stringify(result.error));
      throw new Error(`Resend API error: ${JSON.stringify(result.error)}`);
    }
    
    console.log(`[Resend] Check-in email sent successfully:`, JSON.stringify(result));
    return result;
  } catch (error: any) {
    console.error(`[Resend] Check-in email send FAILED:`, error?.message || error);
    throw error;
  }
}
