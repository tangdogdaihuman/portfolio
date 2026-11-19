# Admin Components

- This directory contains client-side admin UI split out from `app/admin/page.tsx`.
- Keep API calls in these components aligned with `app/api/**` routes.
- Keep form state updates immutable and centralized in `work-form-state.ts`; functional `setState` is allowed for async or batched updates.
- Do not import server-only modules such as `lib/db.ts`, `lib/r2.ts`, `sharp`, or `crypto` here.
