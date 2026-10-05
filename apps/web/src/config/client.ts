import { readClientConfiguration } from "@airmech/config/client";

// Direct access lets Next.js inline the approved public value into browser code.
export const clientConfiguration = readClientConfiguration({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
});
