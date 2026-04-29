/**
 * knetc welcome email template.
 *
 * Design tokens are mirrored from the live marketing site (app/page.tsx,
 * tailwind.config.ts, app/globals.css). Layout is fully table-based for
 * Outlook compatibility, all critical styles are inlined, and only system
 * fonts are referenced — no remote font loading.
 */

const MONO_STACK =
  "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace";
const SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const ROSTER: ReadonlyArray<{ name: string; role: string; body: string }> = [
  {
    name: "Alex",
    role: "Chief of Staff",
    body: "Your point of contact. Loops in the right people.",
  },
  {
    name: "Jeremy",
    role: "CFO",
    body: "Financial modeling, unit economics, fundraising math.",
  },
  {
    name: "Kai",
    role: "CTO",
    body: "Architecture, code, debugging, anything technical.",
  },
  {
    name: "Dana",
    role: "Head of Sales",
    body: "GTM, pipeline, partnerships.",
  },
  {
    name: "Maya",
    role: "Head of Marketing",
    body: "Positioning, content, growth.",
  },
  {
    name: "Marcus",
    role: "General Counsel",
    body: "Contracts, IP, compliance, legal structure.",
  },
];

function rosterRow(
  agent: (typeof ROSTER)[number],
  isLast: boolean,
): string {
  const bottomBorder = isLast ? "border-bottom:1px solid #ffffff;" : "";
  return `
              <tr>
                <td style="padding:32px 0 32px 0;border-top:1px solid #ffffff;${bottomBorder}">
                  <p style="margin:0 0 6px 0;color:#ffffff;font-family:${MONO_STACK};font-size:18px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;line-height:1.1;mso-line-height-rule:exactly;">${agent.name}</p>
                  <p style="margin:0 0 14px 0;color:rgba(255,255,255,0.55);font-family:${MONO_STACK};font-size:11px;font-weight:400;letter-spacing:0.22em;text-transform:uppercase;line-height:1.2;">${agent.role}</p>
                  <p style="margin:0;color:rgba(255,255,255,0.82);font-family:${SANS_STACK};font-size:16px;font-weight:400;line-height:1.55;">${agent.body}</p>
                </td>
              </tr>`;
}

export interface WelcomeEmailParams {
  /** Absolute URL of the user's first chat with Alex. */
  dashboardUrl: string;
  /** Absolute URL of the public marketing site (used in the footer). */
  marketingUrl?: string;
  /** Year for footer copyright. Defaults to the current year. */
  year?: number;
}

export function welcomeEmailHtml({
  dashboardUrl,
  marketingUrl = "https://knetc.team",
  year = new Date().getFullYear(),
}: WelcomeEmailParams): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>Your team is in.</title>
    <!--[if mso]>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
        <o:AllowPNG/>
      </o:OfficeDocumentSettings>
    </xml>
    <![endif]-->
    <style>
      /* Outlook 2007+ resets */
      table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
      img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
      a { text-decoration:none; }

      /* Mobile */
      @media only screen and (max-width: 620px) {
        .container { width:100% !important; max-width:100% !important; }
        .px { padding-left:24px !important; padding-right:24px !important; }
        .py-section { padding-top:48px !important; padding-bottom:48px !important; }
        .py-cta { padding-top:48px !important; padding-bottom:64px !important; }
        .display { font-size:48px !important; line-height:0.98 !important; }
        .display-boardroom { font-size:44px !important; line-height:0.98 !important; }
        .agent-name { font-size:16px !important; }
        .cta-link { padding-left:32px !important; padding-right:32px !important; }
      }

      /* Dark-mode hint — the email is dark-by-default; this just stops
         well-meaning clients from inverting the white Boardroom block. */
      @media (prefers-color-scheme: dark) {
        .boardroom-bg { background-color:#ffffff !important; }
        .boardroom-text { color:#1C1C1E !important; }
        .boardroom-text-muted { color:rgba(28,28,30,0.65) !important; }
      }

      /* Gmail's dark-mode forced-color overrides */
      u + .body .boardroom-bg { background-color:#ffffff !important; }
      u + .body .boardroom-text { color:#1C1C1E !important; }
    </style>
  </head>
  <body class="body" style="margin:0;padding:0;background-color:#000000;">
    <!-- Preheader (inbox preview) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#000000;opacity:0;">
      Your team is in. Alex, Jeremy, Kai, Dana, Maya, Marcus — all on call.
    </div>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#000000;">
      <tr>
        <td align="center" style="padding:0;background-color:#000000;">

          <table role="presentation" class="container" border="0" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;background-color:#000000;">

            <!-- HEADER -->
            <tr>
              <td class="px" style="padding:36px 48px 32px 48px;background-color:#000000;">
                <span style="display:inline-block;color:#ffffff;font-family:${MONO_STACK};font-size:14px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;line-height:1;">KNETC</span>
              </td>
            </tr>

            <!-- HERO -->
            <tr>
              <td class="px py-section" style="padding:64px 48px 56px 48px;background-color:#000000;border-top:1px solid #ffffff;">
                <p style="margin:0 0 8px 0;color:rgba(255,255,255,0.55);font-family:${MONO_STACK};font-size:12px;font-weight:400;letter-spacing:0.28em;text-transform:uppercase;line-height:1;">01</p>
                <p style="margin:0 0 36px 0;color:#ffffff;font-family:${MONO_STACK};font-size:12px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;line-height:1;">Your Team</p>
                <h1 class="display" style="margin:0;color:#ffffff;font-family:${SANS_STACK};font-size:64px;font-weight:700;letter-spacing:-0.02em;text-transform:uppercase;line-height:0.95;mso-line-height-rule:exactly;">
                  Your team<br />is in.
                </h1>
              </td>
            </tr>

            <!-- ROSTER -->
            <tr>
              <td class="px" style="padding:0 48px 0 48px;background-color:#000000;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
${ROSTER.map((a, i) => rosterRow(a, i === ROSTER.length - 1)).join("")}
                </table>
              </td>
            </tr>

            <!-- BOARDROOM (white inversion — the brand moment) -->
            <tr>
              <td class="boardroom-bg" style="background-color:#ffffff;padding:0;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="boardroom-bg" style="background-color:#ffffff;">
                  <tr>
                    <td class="px py-section" style="padding:72px 48px 72px 48px;background-color:#ffffff;">
                      <p class="boardroom-text-muted" style="margin:0 0 8px 0;color:rgba(28,28,30,0.55);font-family:${MONO_STACK};font-size:12px;font-weight:400;letter-spacing:0.28em;text-transform:uppercase;line-height:1;">02</p>
                      <p class="boardroom-text" style="margin:0 0 32px 0;color:#1C1C1E;font-family:${MONO_STACK};font-size:12px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;line-height:1;">The Boardroom</p>
                      <h2 class="display-boardroom boardroom-text" style="margin:0 0 32px 0;color:#1C1C1E;font-family:${SANS_STACK};font-size:56px;font-weight:700;letter-spacing:-0.02em;text-transform:uppercase;line-height:0.95;mso-line-height-rule:exactly;">
                        All Six.<br />One Brief.
                      </h2>
                      <p class="boardroom-text" style="margin:0;max-width:460px;color:#1C1C1E;font-family:${MONO_STACK};font-size:15px;font-weight:400;line-height:1.7;">
                        Ask one question and every agent responds. Alex synthesises their answers into a single executive brief.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- QUICK ORIENTATION -->
            <tr>
              <td class="px py-section" style="padding:64px 48px 16px 48px;background-color:#000000;">
                <p style="margin:0 0 8px 0;color:rgba(255,255,255,0.55);font-family:${MONO_STACK};font-size:12px;font-weight:400;letter-spacing:0.28em;text-transform:uppercase;line-height:1;">03</p>
                <p style="margin:0 0 36px 0;color:#ffffff;font-family:${MONO_STACK};font-size:12px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;line-height:1;">Quick Orientation</p>

                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
                  <tr>
                    <td valign="top" width="24" style="width:24px;padding-top:9px;line-height:0;font-size:0;">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="8" height="8" style="width:8px;height:8px;background-color:#ffffff;line-height:8px;font-size:0;">&nbsp;</td></tr></table>
                    </td>
                    <td style="padding-left:0;">
                      <p style="margin:0;color:rgba(255,255,255,0.85);font-family:${SANS_STACK};font-size:16px;font-weight:400;line-height:1.55;">Your agents build real artifacts &mdash; Sheets, Docs, Gmail drafts. Not just advice.</p>
                    </td>
                  </tr>
                </table>

                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td valign="top" width="24" style="width:24px;padding-top:9px;line-height:0;font-size:0;">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td width="8" height="8" style="width:8px;height:8px;background-color:#ffffff;line-height:8px;font-size:0;">&nbsp;</td></tr></table>
                    </td>
                    <td style="padding-left:0;">
                      <p style="margin:0;color:rgba(255,255,255,0.85);font-family:${SANS_STACK};font-size:16px;font-weight:400;line-height:1.55;">Use Agent Memory in Settings to brief the team on your company.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td class="px py-cta" align="left" style="padding:40px 48px 96px 48px;background-color:#000000;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${dashboardUrl}" style="height:60px;v-text-anchor:middle;width:280px;" arcsize="0%" stroke="t" strokecolor="#ffffff" fillcolor="#ffffff">
                  <w:anchorlock/>
                  <center style="color:#000000;font-family:Menlo,Consolas,monospace;font-size:13px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;">START WITH ALEX &rarr;</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <a class="cta-link" href="${dashboardUrl}" style="display:inline-block;background-color:#ffffff;color:#000000;font-family:${MONO_STACK};font-size:13px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;line-height:1;text-decoration:none;padding:22px 44px;border:1px solid #ffffff;mso-padding-alt:0;">Start with Alex&nbsp;&nbsp;&rarr;</a>
                <!--<![endif]-->
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td class="px" style="padding:28px 48px 40px 48px;background-color:#000000;border-top:1px solid #ffffff;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td valign="middle" style="padding:14px 0;">
                      <span style="display:inline-block;color:#ffffff;font-family:${MONO_STACK};font-size:12px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;line-height:1;">KNETC</span>
                    </td>
                    <td valign="middle" align="right" style="padding:14px 0;">
                      <span style="color:rgba(255,255,255,0.45);font-family:${MONO_STACK};font-size:11px;font-weight:400;letter-spacing:0.12em;text-transform:uppercase;line-height:1.4;">&copy; ${year} knetc &nbsp;&middot;&nbsp; <a href="${marketingUrl}" style="color:rgba(255,255,255,0.45);text-decoration:none;">knetc.team</a></span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Plain-text fallback. Mirrors the HTML structure for clients that prefer
 * (or only render) text/plain.
 */
export function welcomeEmailText({ dashboardUrl }: WelcomeEmailParams): string {
  const roster = ROSTER.map((a) => `  ${a.name} — ${a.role}. ${a.body}`).join(
    "\n",
  );

  return `KNETC

01 — YOUR TEAM

Your team is in.

${roster}

02 — THE BOARDROOM

All Six. One Brief.

Ask one question and every agent responds. Alex synthesises their answers into a single executive brief.

03 — QUICK ORIENTATION

— Your agents build real artifacts — Sheets, Docs, Gmail drafts. Not just advice.
— Use Agent Memory in Settings to brief the team on your company.

Start with Alex →
${dashboardUrl}

—
KNETC · knetc.team`;
}
