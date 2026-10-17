# Fresh-install handover

## Local Docker Compose

Requires Docker Engine and Docker Compose v2. No existing interview database,
Kubernetes cluster, or GitLab runner is needed.

```sh
cp .env.example .env
# Edit .env: replace both passwords and the sign-in email.
docker compose up --build -d
docker compose logs setup
docker compose logs app
```

Open http://localhost:3000/login and use the bootstrap account. The database
starts empty. The dashboard offers a clearly labeled synthetic example; load it
for a quick review/export demonstration, or create an interview and add a transcript.
AI and live calls require their optional credentials in .env.

Startup waits for PostgreSQL health, then successfully completed migrations and
account provisioning before starting the web app. Existing account passwords are
never overwritten. Bootstrap credentials are supplied only to setup, not the app.
The database has no published host port. Passwords use PG environment variables
rather than being interpolated into a connection URL.

For subsequent releases, rerun setup explicitly before starting the new app:

```sh
docker compose build
docker compose run --rm setup
docker compose up -d app
```

To add another account, change the bootstrap email/password in .env and run
`docker compose run --rm setup`. This does not remove the first account.

`docker compose down` retains the named PostgreSQL volume. Back up that volume or
use pg_dump before changing databases. `docker compose down --volumes` permanently
deletes the local database. Changing POSTGRES_PASSWORD after initialization does
not change the password stored in an existing PostgreSQL volume.

The app is bound to localhost. Remote microphone/camera use needs HTTPS and a
matching APP_ORIGIN. This stack does not provision LiveKit or an audio archive.
Successful speech transcription can be saved as text; audio remains temporary.

The Compose .env is used for substitution, not automatically loaded by Node setup
scripts. For non-Docker development, follow database.md and supply DATABASE_URL to
the shell commands; .env.example's PG setup is specifically for Compose.

## Cloud Run handover

Compose is a local reproducibility tool. Deploy the web container to Cloud Run
and use an external PostgreSQL service, such as Cloud SQL, for durable storage.
Do not deploy the Compose database as an ephemeral Cloud Run container.

Build two Linux amd64 images from this repository:

```sh
docker build --platform linux/amd64 --target runner -t YOUR_APP_IMAGE .
docker build --platform linux/amd64 --target setup -t YOUR_SETUP_IMAGE .
```

Publish them to your project's Artifact Registry. The receiving operator needs
the GCP project/region, registry, runtime service account, database network path,
database credentials, Gemini credentials, and external LiveKit credentials.
A private on-premises database address is not automatically reachable from GCP.

1. Provision an empty PostgreSQL database and an application role allowed to own
   the ai_cup_2026 schema. Configure networking from both the service and setup job.
   Use a direct or session-pooled DATABASE_URL, not transaction pooling.
2. Configure Secret Manager secrets and grant the runtime/setup service accounts
   access to only their required secrets. Do not bake secrets into either image.
3. Run a Cloud Run Job using YOUR_SETUP_IMAGE with DATABASE_URL. Its default command
   runs migrations. Wait for successful completion before deploying the app.
4. Run a separate setup job execution with command `node`, arguments
   `scripts/create-user.mjs`, and DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL,
   BOOTSTRAP_ADMIN_PASSWORD. Keep bootstrap credentials out of the web service.
5. Deploy YOUR_APP_IMAGE as a Cloud Run service. Use container port 3000,
   request timeout at least 120 seconds, and initially a small maximum instance
   count appropriate to database capacity. The standalone server listens on
   0.0.0.0 and honors Cloud Run's PORT environment variable.
6. Set DATABASE_URL and APP_ORIGIN to the actual HTTPS browser origin. Set
   GEMINI_API_KEY and an available audio/text-capable
   GEMINI_MODEL for transcription and full report drafting. Set LIVEKIT_URL,
   LIVEKIT_API_KEY and LIVEKIT_API_SECRET for calls. The optional Gemini
   relay has its own variables in .env.example; direct Gemini access must be
   tested from the chosen region before removing an existing relay configuration.
7. Allow browser access to the service if using the app's own login. Verify login,
   save/reload, meeting/microphone, speech transcription, saved source analysis,
   report drafting and export. Test an error/retry path. Create judge accounts
   and one labeled sample interview. If changing domains, update APP_ORIGIN and
   retest sign-in/logout and write requests at the final origin.

This repository does not yet automate GCP resource provisioning, IAM, database
backups, custom-domain configuration or Cloud Run releases. Those remain explicit
handover responsibilities. Pushing to main does not deploy Cloud Run. Record the GCP service URL, image digest,
successful setup execution, secret names (not values), and test results for the
next operator. No existing interview data needs to be copied for a clean demo.

Official references: [Cloud Run container contract](https://cloud.google.com/run/docs/container-contract),
[executing Cloud Run Jobs](https://cloud.google.com/run/docs/execute/jobs).
