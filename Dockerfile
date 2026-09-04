# Self-hostable OpsCanopy.
#
# Production runs on Cloudflare Static Assets, not on this image. This exists so
# the site can run in an air-gapped network — the audience most likely to care
# that a JWT or a Terraform plan never leaves the machine — and so the project is
# eligible for the self-hosting ecosystem (awesome-selfhosted requires a
# container image and a release at least four months old).
#
#   docker build -t opscanopy .
#   docker run --rm -p 8080:8080 opscanopy
#
# Everything still runs client-side. There is no backend in this image either:
# it is nginx serving a directory of static files.

# ── Build ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# npm ci against the lockfile alone, so a source-only change reuses this layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `npm run build` (never a bare `astro build`): the postbuild chain is what emits
# the Pagefind search index, verifies trailing slashes, injects the CodeMirror
# modulepreload hints, generates the service worker, and — critically here —
# replaces the CSP script-hash marker. A build that skipped it would ship an
# invalid Content-Security-Policy.
RUN npm run build

# _headers is Cloudflare syntax; translate it into something nginx honours so the
# container keeps the same CSP, HSTS and cache policy as production rather than
# quietly serving the site unprotected.
RUN node scripts/headers-to-nginx.mjs

# ── Serve ─────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

# Unprivileged by default: nginx-alpine's stock config wants to write to
# /var/cache/nginx and /var/run, so hand those to the nginx user and run as it.
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/dist/nginx-headers.conf /etc/nginx/opscanopy-headers.conf
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# The generated headers file lives inside the served root; drop it so it is not
# reachable at https://<host>/nginx-headers.conf.
RUN rm -f /usr/share/nginx/html/nginx-headers.conf \
 && rm -f /usr/share/nginx/html/_headers /usr/share/nginx/html/_redirects \
 && touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/cache/nginx /var/run/nginx.pid /usr/share/nginx/html

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
