# Excel Admissions Intelligence — secure live deployment candidate

This private GitHub repository contains the existing V1 historical snapshot and a new **authenticated, server-side CTM live aggregate panel**. It is **not a live hosted website until a private application host is connected and deployed**.

## What is ready

- `server.mjs` serves the dashboard only after HTTP Basic authentication using environment variables.
- `/api/ctm/summary?range=24h|48h|7d|30d` retrieves CTM calls server-side with a five-minute cache. It exposes only aggregate counts, not raw calls, patient identifiers, recordings, phone numbers or contact details.
- The new live panel refreshes every five minutes in the browser. It does **not** silently overwrite the dated V1 historical snapshot.
- `Dockerfile` and `render.yaml` provide a deployable private application host blueprint.
- `npm run check` validates JavaScript syntax in CI.

## Deployment: manual owner actions required

1. Connect a trusted container host such as Render to the **private** GitHub repository and select the branch to deploy. The included `render.yaml` is a Render Blueprint starting point; do not create a public GitHub Pages site.
2. Configure the following host-side secret environment variables (never commit them or paste them into GitHub source):
   - `DASHBOARD_USER` — private dashboard login
   - `DASHBOARD_PASSWORD` — strong shared password of at least 16 characters
   - `CTM_API_KEY` and `CTM_API_SECRET` — dedicated read-only CTM API credentials, if available
   - `CTM_ACCOUNT_ID=552231`
3. Enable HTTPS (the host's TLS endpoint), restricted authorized access, secret rotation and access logging without patient identifiers. Consider SSO/MFA and access policy enforcement for production; shared Basic Auth alone is not sufficient for PHI access.
4. Verify CTM account permission and source-field semantics in production. If CTM credentials are absent, the panel explicitly reports unavailable rather than inventing numbers.
5. Verify secure Dazos historical paginated read access and call-to-lead linkage **before** adding Dazos conversion counts. Dazos remains unverified, not zero.
6. Review the security/compliance posture and vendor agreements before putting any patient-identifying or protected health information in this system. This deployment is designed for aggregate-only reporting.

## Privacy boundaries

- Do not publish this dashboard through GitHub Pages. A private GitHub repository does not make a Pages website private.
- Do not store CTM or Dazos credentials, raw calls, patient information, recordings, lead records, or identifying metadata in repository files, logs, static HTML or exports.
- Existing V1 snapshot: Oct 8–Nov 6, 2026; 372 inbound calls (Excel 222, Nirvana 115, unclassified 35); these numbers are historical, not live.
- Agent and keyword report grains differ; Dazos admissions, prescreens, VOB and conversions are **unverified**.

## Local smoke test

```sh
export DASHBOARD_USER=admin
export DASHBOARD_PASSWORD='replace-with-a-long-random-password'
export CTM_API_KEY='read-only-key'
export CTM_API_SECRET='read-only-secret'
npm run check
npm start
# Then visit http://localhost:3000 (production must use HTTPS)
```

The backend refuses to start without dashboard credentials. All requests, including the API, require authentication.
