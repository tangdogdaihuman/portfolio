# Admin Components

- This directory contains client-side admin UI split out from `app/admin/page.tsx`.
- Keep API calls in these components aligned with `app/api/**` routes.
- Keep form state updates in the existing object-replacement style unless a component is fully rewritten.
- Do not import server-only modules such as `lib/db.ts`, `lib/r2.ts`, `sharp`, or `crypto` here.
