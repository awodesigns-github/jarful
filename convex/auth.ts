import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Email } from "@convex-dev/auth/providers/Email";
import Google from "@auth/core/providers/google";
import { query } from "./_generated/server";

type Env = Record<string, string | undefined>;

/** Which optional sign-in methods have their secrets set. Pure, so tests can pass an env. */
export function authMethodsFromEnv(env: Env) {
  return {
    google: !!env.AUTH_GOOGLE_ID && !!env.AUTH_GOOGLE_SECRET,
    email: !!env.AUTH_RESEND_KEY && !!env.AUTH_RESEND_FROM,
  };
}

/** A uniformly random 6-digit code (rejection sampling, no modulo bias). */
function sixDigitCode() {
  const limit = 4294967296 - (4294967296 % 1000000);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1000000).padStart(6, "0");
}

/** One-time email code sent through Resend's HTTP API. Needs AUTH_RESEND_KEY and AUTH_RESEND_FROM. */
const ResendCode = Email({
  id: "resend-otp",
  maxAge: 60 * 10,
  async generateVerificationToken() {
    return sixDigitCode();
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.AUTH_RESEND_FROM,
        to: [email],
        subject: "Your Jarful code",
        text: `Your Jarful sign-in code is ${token}. It works for 10 minutes. If you did not ask for it, ignore this email.`,
      }),
    });
    if (!res.ok) throw new Error("Could not send the sign-in code");
  },
});

// A provider whose secrets are missing is simply left out, so the deployment
// still starts. signIn("google") then fails with "not configured" and the UI,
// which reads getAuthMethods, never offers it.
const methods = authMethodsFromEnv(process.env);
const providers = [
  Anonymous,
  ...(methods.google
    ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET })]
    : []),
  ...(methods.email ? [ResendCode] : []),
];

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    // OAuth returns to the app through its custom scheme (jarful://, or exp:// in Expo Go).
    // The one-time code is bound to the verifier held on the device, so a different
    // redirect target cannot use it.
    async redirect({ redirectTo }) {
      if (redirectTo.startsWith("jarful://") || redirectTo.startsWith("exp://")) return redirectTo;
      const site = process.env.SITE_URL;
      if (site && (redirectTo === site || redirectTo.startsWith(site + "/"))) return redirectTo;
      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) return `${site ?? ""}${redirectTo}`;
      throw new Error("Invalid redirectTo");
    },
  },
});

/** Which optional sign-in methods this deployment has set up. Safe to call before sign-in. */
export const getAuthMethods = query({
  args: {},
  handler: async () => authMethodsFromEnv(process.env),
});
