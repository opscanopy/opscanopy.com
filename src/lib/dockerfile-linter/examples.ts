/**
 * Dockerfile Linter — the four example chips.
 *
 * Order is deliberate. The kitchen sink comes FIRST because the boot seed is
 * what a first-time visitor sees before touching anything: a Dockerfile with
 * nothing wrong would demonstrate nothing, and would leave the results panel
 * with no finding to copy. The rest walk down the severity ladder:
 *
 *   1. kitchen-sink     — fifteen findings across fifteen rules.
 *   2. clean-multistage — the same job done right: zero findings.
 *   3. python-slim      — a realistic middle: two warnings and one note.
 *   4. heredoc-build    — a BuildKit heredoc whose BODY hides the pipe-to-shell,
 *                         which is what proves the parser reads heredocs.
 *
 * Line numbers matter here: `engine.test.ts` pins the findings these examples
 * produce, including which physical line each one lands on. Editing an example
 * without updating those assertions will fail the suite, which is the point.
 */
import type { DockerfileExample } from './types';

export const examples: DockerfileExample[] = [
  {
    id: 'kitchen-sink',
    label: 'Kitchen sink',
    dockerfile: `FROM ubuntu
MAINTAINER ops@example.com
WORKDIR app
ADD ./entrypoint.sh /entrypoint.sh
ADD https://example.com/tool.sh /usr/local/bin/tool
RUN apt-get update
RUN apt-get install -y curl git
RUN curl -fsSL https://get.example.com/install.sh | bash
RUN sudo chown -R 1000:1000 /opt/app
RUN cd /opt/app && ./configure
ENV DB_PASSWORD=hunter2
COPY . /opt/app
RUN npm install
CMD ['node', 'server.js']
CMD ["node", "server.js"]
`,
  },
  {
    id: 'clean-multistage',
    label: 'Clean multi-stage Node',
    dockerfile: `# syntax=docker/dockerfile:1
ARG NODE_VERSION=22.11.0

FROM node:\${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:\${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
CMD ["node", "server.js"]
`,
  },
  {
    id: 'python-slim',
    label: 'Python slim (realistic)',
    dockerfile: `FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
       build-essential \\
       libpq-dev

WORKDIR /srv

COPY . /srv
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8000
CMD ["gunicorn", "-b", "0.0.0.0:8000", "app:application"]
`,
  },
  {
    id: 'heredoc-build',
    label: 'Heredoc build',
    dockerfile:
      '# syntax=docker/dockerfile:1\n' +
      'FROM debian:bookworm-slim\n' +
      '\n' +
      'RUN <<-DONE\n' +
      '\tapt-get update\n' +
      '\tapt-get install -y --no-install-recommends ca-certificates curl\n' +
      '\tcurl -fsSL https://get.example.com/setup.sh | sh\n' +
      'DONE\n' +
      '\n' +
      'USER 1000:1000\n' +
      'CMD ["/bin/bash"]\n',
  },
];
