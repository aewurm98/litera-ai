import twilio from "twilio";

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { client: twilio(accountSid, authToken), fromNumber };
}

export async function sendCarePlanSms(
  to: string,
  patientName: string,
  accessLink: string,
  pin?: string | null
): Promise<boolean> {
  const twilio = getClient();
  if (!twilio) return false;

  const pinLine = pin ? `\nYour PIN: ${pin}` : "";
  const body = `Hi ${patientName}, your care plan is ready. Access it here: ${accessLink}${pinLine}`;

  try {
    await twilio.client.messages.create({ body, from: twilio.fromNumber, to });
    return true;
  } catch (err) {
    console.error("SMS (care plan) failed:", err);
    return false;
  }
}

export async function sendCheckInSms(
  to: string,
  patientName: string,
  accessLink: string
): Promise<boolean> {
  const twilio = getClient();
  if (!twilio) return false;

  const body = `Hi ${patientName}, how are you feeling? Please complete your check-in: ${accessLink}`;

  try {
    await twilio.client.messages.create({ body, from: twilio.fromNumber, to });
    return true;
  } catch (err) {
    console.error("SMS (check-in) failed:", err);
    return false;
  }
}
