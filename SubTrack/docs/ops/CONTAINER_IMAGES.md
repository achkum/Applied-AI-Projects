# API and web container images

Run builds from `SubTrack/`:

```sh
docker build -f apps/api/Dockerfile -t subtrack-api:local .
docker build -f apps/web/Dockerfile -t subtrack-web:local .
```

Both builds use the committed lockfile and pnpm 12.6.0. API generation happens during the build with a dummy database URL; it does not apply migrations. The generated Prisma client is explicitly transferred into the production dependency tree. The API image uses Debian bookworm and OpenSSL; the web image contains Next.js standalone output, traced workspace dependencies, static files and public assets. Both processes run as unprivileged users.

In a build environment with an HTTPS proxy and its own trusted CA, pass the existing proxy variables using Docker's predefined build arguments and supply the CA through a BuildKit secret. Do not put proxy credentials or a private certificate key in a Dockerfile or build context. The certificate is an optional trust input and is never copied into the image:

```sh
docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY \
  --build-arg http_proxy --build-arg https_proxy \
  --secret id=environment_ca,src="$NODE_EXTRA_CA_CERTS" \
  -f apps/api/Dockerfile -t subtrack-api:local .
```

Use the equivalent arguments for the web build. The environment may also require `--network=host` for build-time access to its provided proxy. TLS verification, package integrity checks and signed Debian package metadata remain enabled.

Supply `DATABASE_URL` to the API at runtime using the deployment secret mechanism. It must point to a reachable PostgreSQL instance; Prisma connects during application startup. The images do not install dependencies or apply migrations at startup. Web listens on port 3000 and API on port 4000. No host ports are published by building an image.

Before using an image, check the API's `/healthz` and both `/sv` and `/en` web routes, including a referenced static asset. A successful health response proves process startup and connectivity, not authorization, migration correctness or complete user flows. The current active caller-ID security finding, unresolved migration inventory and absent worker runtime remain deployment blockers. Keep public exposure disabled until those gates are satisfied. Native Android/iOS verification remains deferred.
