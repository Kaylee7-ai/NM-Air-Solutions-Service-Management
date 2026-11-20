# NM Air Solutions Service — Service Desk

A customer-facing HVAC service website and shared operations workspace for NM Air Solutions Service in Tema, Ghana.

## Current architecture

- **Website:** GitHub Pages at https://kaylee7-ai.github.io/NM-Air-Solutions-Service-Management/
- **API:** Cloudflare Worker named `nm-air-service-api`
- **Database:** Cloudflare D1 database named `nm-air-service-management`
- **Customer bookings:** Public request form writes to the shared database and returns a job reference.
- **Tracking:** Customers can check the latest public job status with that reference.
- **Staff workspace:** Owner, manager and technician roles; authenticated sessions; technician assignment; job status changes.
- **Commercial records:** Draft quotations and invoices, including invoice status updates.
- **WhatsApp:** Optional click-to-chat follow-up after a booking is saved. The customer still reviews and sends the message.

## Cloudflare resources

The Worker is deployed at:

`https://nm-air-service-api.nm-air-solutions-service.workers.dev`

The Worker uses the D1 binding `DB`. Database schema is documented in `worker/migrations/0001_initial.sql`. The migration has been applied to the connected D1 database.

## Required one-time owner setup

Before the first owner account can be created, configure a secret in Cloudflare:

1. Open Cloudflare Dashboard → Workers & Pages → `nm-air-service-api`.
2. Open Settings → Variables and Secrets.
3. Add a **Secret** named `SETUP_KEY`. Choose a private random value at least 32 characters long. Do not put it in GitHub or send it in a public message.
4. Save and redeploy the Worker if Cloudflare asks.
5. Open the public website and choose the operations dashboard. The first-time setup screen asks for this setup code and the owner's account details.
6. After the owner account is created, remove the `SETUP_KEY` secret from the Worker settings. The API permanently blocks further first-owner setup once any user exists.

The business owner should create the owner account themselves. Do not use a developer's personal email as the business owner account.

## Roles and permissions

- **Owner:** view all requests and staff; create manager/technician accounts; assign technicians; manage quotations and invoices; disable staff accounts.
- **Manager:** view all requests and staff; assign technicians; manage quotations and invoices.
- **Technician:** view only assigned requests and update the status of those assigned jobs.

Staff accounts are created by the owner. Use unique passwords of at least 12 characters and share credentials privately.

## API routes

- `GET /health` — database connectivity check
- `GET /api/setup-status` — whether first-owner setup is required
- `POST /api/setup` — one-time owner creation (requires `X-Setup-Key`)
- `POST /api/login`, `POST /api/logout`, `GET /api/me` — staff sessions
- `POST /api/requests`, `GET /api/requests`, `PATCH /api/requests/:id` — bookings and job management
- `GET /api/track?reference=...` — public job tracking
- `GET /api/staff`, `POST /api/staff`, `PATCH /api/staff/:id` — staff management
- `GET /api/quotes`, `POST /api/quotes` — quotations
- `GET /api/invoices`, `POST /api/invoices`, `PATCH /api/invoices/:id` — invoices
- `GET /api/activity` — activity history

## Security and operational notes

- Passwords are stored as salted PBKDF2-HMAC-SHA-256 hashes; session tokens are random and only their SHA-256 hashes are stored in D1.
- The API validates inputs and checks roles on the server, not only in the browser.
- Public job tracking reveals the reference, service type, preferred date and status, not customer phone numbers or addresses.
- The API accepts browser requests from the GitHub Pages origin. Keep the setup secret out of source control.
- No email verification, password-reset email, automatic WhatsApp delivery, online payment collection, PDF invoice delivery, backups policy, or formal privacy/legal review is implemented yet.
- Before the company uses this with real customer information, the business must confirm the contact number, approve the website and privacy notice, designate its owner account, and test booking, staff access, assignments, tracking, quotes and invoices.
- This repository is an independently developed proposal until the company authorizes its use. Public listing details must be confirmed by the business.

## Local development

The Worker source is in `worker/index.js`. The SQL migration is in `worker/migrations/0001_initial.sql`. The deployed Worker uses a D1 binding named `DB`. Add the `SETUP_KEY` secret in the Cloudflare dashboard before first-owner setup.
