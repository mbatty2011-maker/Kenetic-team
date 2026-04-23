import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { alexWorker } from "@/lib/inngest/alex-worker";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [alexWorker] });

// maxDuration caps the Vercel serverless invocation for each individual step,
// NOT the total Inngest function runtime. Inngest orchestrates durably across
// many invocations — total runtime is unbounded. 300s gives each step plenty
// of headroom for long Anthropic API calls. Requires Vercel Pro for >60s.
export const maxDuration = 300;
