# Deployment Guide

## Vercel Analytics

This project now includes Vercel Analytics in the root layout.

- The `Analytics` component is rendered in `app/layout.tsx` so page views and Web Vitals are tracked automatically.
- Analytics are disabled when `NODE_ENV=test` to avoid polluting test data.
- No wallet addresses or other PII are passed to Vercel Analytics because only default pageview and performance data are tracked.

## Environment variables

Add the following variable to `.env.local` or your deployment environment:

```env
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=<your-vercel-analytics-id>
```

If you are deploying to Vercel, also set `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` in your project environment variables.

## Notes

- Do not include wallet addresses in any custom analytics events.
- The app only uses Vercel Analytics for standard pageviews and Web Vitals, not custom PII events.
