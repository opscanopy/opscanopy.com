/**
 * Docker Run ↔ Compose — engine tests.
 *
 * Vectors are drawn from the canonical Docker CLI / Compose documentation:
 *   • `docker run -d -p 8080:80 --name web -v …:ro nginx:alpine`  (run reference)
 *   • the `--mount`, `--env`, `--restart`, `--cap-add` examples from the docs.
 *
 * Coverage:
 *   • runToCompose happy paths (flag mapping, bundled short flags, =value forms)
 *   • composeToRun happy paths (lists, mappings, healthcheck, command)
 *   • round-trip-ish equivalence
 *   • empty / malformed / garbage input → ok:false WITHOUT throwing
 */
import { describe, it, expect } from 'vitest';
import { runToCompose, composeToRun, encodeState } from './engine';
import { examples } from './examples';
import { base64UrlDecode } from '../codec';

describe('runToCompose — canonical docs example', () => {
  it('maps the nginx publish + bind-mount run line into a compose service', () => {
    const r = runToCompose(
      'docker run -d -p 8080:80 --name web -v /data:/usr/share/nginx/html:ro nginx:alpine',
    );
    expect(r.ok).toBe(true);
    const y = r.yaml!;
    expect(y).toContain('services:');
    expect(y).toContain('web:');
    expect(y).toContain('image: nginx:alpine');
    expect(y).toContain('container_name: web');
    expect(y).toContain('ports:');
    expect(y).toContain('- "8080:80"'); // numeric-looking → quoted
    expect(y).toContain('volumes:');
    expect(y).toContain('- /data:/usr/share/nginx/html:ro');
    // `-d` (detach) is not representable in Compose → a warning, not output.
    expect(y).not.toContain('detach');
    expect(r.warnings.join(' ')).toMatch(/-d|--detach/);
  });

  it('keys the service by the container name when --name is present', () => {
    const r = runToCompose('docker run --name myapp nginx');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('  myapp:');
  });

  it('falls back to "app" as the service key when there is no --name', () => {
    const r = runToCompose('docker run nginx:alpine');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('  app:');
    expect(r.yaml!).toContain('image: nginx:alpine');
  });
});

describe('runToCompose — flag forms', () => {
  it('accepts --flag=value as well as --flag value', () => {
    const r = runToCompose('docker run --restart=always --name=db postgres:16');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('restart: always');
    expect(r.yaml!).toContain('  db:');
  });

  it('expands bundled short flags (-it) and a value-taking short flag (-p)', () => {
    const r = runToCompose('docker run -itp 80:80 nginx');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('stdin_open: true');
    expect(r.yaml!).toContain('tty: true');
    expect(r.yaml!).toContain('- "80:80"');
  });

  it('maps multiple -e flags to an environment list', () => {
    const r = runToCompose(
      'docker run -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app postgres:16',
    );
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('environment:');
    expect(r.yaml!).toContain('- POSTGRES_PASSWORD=secret');
    expect(r.yaml!).toContain('- POSTGRES_DB=app');
  });

  it('maps --network host to network_mode and a named network to networks', () => {
    const host = runToCompose('docker run --network host nginx');
    expect(host.yaml!).toContain('network_mode: host');
    const named = runToCompose('docker run --network backend nginx');
    expect(named.yaml!).toContain('networks:');
    expect(named.yaml!).toContain('- backend');
  });

  it('maps a --mount spec into the short volume form', () => {
    const r = runToCompose(
      'docker run --mount type=bind,source=/src,target=/app,readonly nginx',
    );
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('- /src:/app:ro');
  });

  it('maps --cap-add / --cap-drop / --privileged', () => {
    const r = runToCompose(
      'docker run --cap-add NET_ADMIN --cap-drop ALL --privileged nginx',
    );
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('cap_add:');
    expect(r.yaml!).toContain('- NET_ADMIN');
    expect(r.yaml!).toContain('cap_drop:');
    expect(r.yaml!).toContain('- ALL');
    expect(r.yaml!).toContain('privileged: true');
  });

  it('assembles a healthcheck from --health-* flags', () => {
    const r = runToCompose(
      'docker run --health-cmd "curl -f http://localhost/ || exit 1" --health-interval 30s --health-retries 3 nginx',
    );
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('healthcheck:');
    expect(r.yaml!).toContain('CMD-SHELL curl -f http://localhost/ || exit 1');
    expect(r.yaml!).toContain('interval: 30s');
    expect(r.yaml!).toContain('retries: 3');
  });

  it('treats the first positional as the image and the rest as the command', () => {
    const r = runToCompose('docker run ubuntu:24.04 echo hello world');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('image: ubuntu:24.04');
    expect(r.yaml!).toContain('command:');
    expect(r.yaml!).toContain('- echo');
    expect(r.yaml!).toContain('- hello');
    expect(r.yaml!).toContain('- world');
  });

  it('honours quoted command arguments containing spaces (one list item)', () => {
    const r = runToCompose('docker run ubuntu bash -lc "echo hello world"');
    expect(r.ok).toBe(true);
    // The quoted token stays one command argument → a single YAML list item.
    expect(r.yaml!).toContain('- echo hello world');
  });

  it('does NOT re-parse command args after the image as flags', () => {
    // Regression: `-lc` after the image is part of the container command, not a
    // bundled short flag. It must NOT be dropped, and `c` must NOT become a
    // phantom label.
    const r = runToCompose('docker run ubuntu bash -lc "echo hi"');
    expect(r.ok).toBe(true);
    const y = r.yaml!;
    expect(y).toContain('image: ubuntu');
    expect(y).toContain('command:');
    expect(y).toContain('- bash');
    expect(y).toContain('- "-lc"'); // leading `-` → quoted, but preserved
    expect(y).toContain('- echo hi');
    expect(y).not.toContain('labels');
  });

  it('keeps every flag-looking token after the image as a verbatim command arg', () => {
    const r = runToCompose('docker run alpine sh -c "exit 1" --extra -p 9');
    expect(r.ok).toBe(true);
    const y = r.yaml!;
    expect(y).toContain('image: alpine');
    expect(y).toContain('- sh');
    expect(y).toContain('- "-c"');
    expect(y).toContain('- exit 1');
    expect(y).toContain('- "--extra"');
    expect(y).toContain('- "-p"');
    expect(y).toContain('- "9"');
    // No phantom ports from the trailing `-p 9` (it's part of the command).
    expect(y).not.toContain('ports:');
  });

  it('maps -h to hostname (not the image) and takes the next token as its value', () => {
    const r = runToCompose('docker run -h myhost nginx');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('hostname: myhost');
    expect(r.yaml!).toContain('image: nginx');
  });

  it('routes --health-retries through scalar() so type-ambiguous values stay strings', () => {
    // A plain word like `abc` is a valid YAML string and stays bare…
    const plain = runToCompose('docker run --health-cmd "true" --health-retries abc nginx');
    expect(plain.ok).toBe(true);
    expect(plain.yaml!).toContain('retries: abc');
    // …but a YAML-reserved/type-ambiguous value MUST be quoted (it used to be
    // interpolated raw, which would mis-type or break the document).
    const ambiguous = runToCompose('docker run --health-cmd "true" --health-retries yes nginx');
    expect(ambiguous.ok).toBe(true);
    expect(ambiguous.yaml!).toContain('retries: "yes"');
    expect(ambiguous.yaml!).not.toMatch(/retries: yes(\s|$)/);
  });

  it('strips a `docker container run` prefix', () => {
    const r = runToCompose('docker container run nginx');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('image: nginx');
  });

  it('handles backslash-newline line continuations', () => {
    const r = runToCompose('docker run -d \\\n  -p 80:80 \\\n  nginx:alpine');
    expect(r.ok).toBe(true);
    expect(r.yaml!).toContain('- "80:80"');
    expect(r.yaml!).toContain('image: nginx:alpine');
  });
});

describe('runToCompose — failure modes never throw', () => {
  it('empty string → ok:false with an error', () => {
    const r = runToCompose('');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('whitespace-only → ok:false', () => {
    expect(runToCompose('   \n  ').ok).toBe(false);
  });

  it('a command with flags but no image → ok:false', () => {
    const r = runToCompose('docker run -d -p 80:80');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/image/i);
  });

  it('an unbalanced quote → ok:false (no throw)', () => {
    const r = runToCompose('docker run nginx "unterminated');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/quote/i);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it('non-string input → ok:false (no throw)', () => {
    expect(() => runToCompose(undefined as unknown as string)).not.toThrow();
    expect((runToCompose(null as unknown as string)).ok).toBe(false);
  });
});

describe('composeToRun — happy paths', () => {
  it('rebuilds a docker run line from the nginx service', () => {
    const yaml = `services:
  web:
    image: nginx:alpine
    container_name: web
    ports:
      - "8080:80"
    volumes:
      - /data:/usr/share/nginx/html:ro
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    const c = r.command!;
    expect(c).toContain('docker run');
    expect(c).toContain('--name web');
    expect(c).toContain('-p 8080:80');
    expect(c).toContain('-v /data:/usr/share/nginx/html:ro');
    expect(c).toContain('nginx:alpine');
  });

  it('reads environment given as a mapping', () => {
    const yaml = `services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    expect(r.command!).toContain('-e POSTGRES_PASSWORD=secret');
    expect(r.command!).toContain('-e POSTGRES_DB=app');
  });

  it('reconstructs --health-* flags from a healthcheck block', () => {
    const yaml = `services:
  cache:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ping"]
      interval: 10s
      retries: 5
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    expect(r.command!).toContain('--health-cmd');
    expect(r.command!).toContain('redis-cli ping');
    expect(r.command!).toContain('--health-interval 10s');
    expect(r.command!).toContain('--health-retries 5');
  });

  it('appends an array command after the image', () => {
    const yaml = `services:
  shell:
    image: ubuntu:24.04
    command:
      - bash
      - -lc
      - echo hello
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    const c = r.command!;
    expect(c.indexOf('ubuntu:24.04')).toBeLessThan(c.indexOf('bash'));
    expect(c).toContain('-lc');
  });

  it('accepts a bare single-service object (no services wrapper)', () => {
    const r = composeToRun('image: nginx:alpine\nports:\n  - "80:80"\n');
    expect(r.ok).toBe(true);
    expect(r.command!).toContain('nginx:alpine');
    expect(r.command!).toContain('-p 80:80');
  });

  it('maps long-form ports and volumes (mapping syntax) instead of dropping them', () => {
    const yaml = `services:
  web:
    image: nginx
    ports:
      - target: 80
        published: 8080
    volumes:
      - type: bind
        source: /a
        target: /b
        read_only: true
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    const c = r.command!;
    expect(c).toContain('-p 8080:80');
    expect(c).toContain('-v /a:/b:ro');
  });

  it('warns when a long-form port has no target (cannot be mapped)', () => {
    const yaml = `services:
  web:
    image: nginx
    ports:
      - published: 8080
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/port/i);
  });

  it('preserves a shell-form string command as a single unit on round-trip', () => {
    const yaml = `services:
  web:
    image: nginx
    command: "echo a && echo b"
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    const c = r.command!;
    // Emitted as `sh -c '<line>'` so `&&` is not re-tokenised when re-parsed.
    expect(c).toContain('sh -c');
    const back = runToCompose(c);
    expect(back.ok).toBe(true);
    // The whole shell line survives as one command argument.
    expect(back.yaml!).toContain('- echo a && echo b');
  });

  it('maps a multi-element entrypoint array to --entrypoint + leading command args', () => {
    const yaml = `services:
  web:
    image: nginx
    entrypoint:
      - /bin/sh
      - -c
      - echo hi
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    const c = r.command!;
    // Only the executable goes to --entrypoint; the rest follow the image.
    expect(c).toContain('--entrypoint /bin/sh');
    expect(c).not.toContain("--entrypoint '/bin/sh -c'");
    expect(c.indexOf('nginx')).toBeLessThan(c.indexOf('-c'));
  });

  it('warns on compose-only keys (depends_on, build, deploy)', () => {
    const yaml = `services:
  web:
    image: nginx
    depends_on:
      - db
    build: .
    deploy:
      replicas: 3
`;
    const r = composeToRun(yaml);
    expect(r.ok).toBe(true);
    const w = r.warnings.join(' ');
    expect(w).toMatch(/depends_on/);
    expect(w).toMatch(/build/);
    expect(w).toMatch(/deploy/);
  });
});

describe('composeToRun — failure modes never throw', () => {
  it('empty string → ok:false', () => {
    const r = composeToRun('');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('garbage / non-mapping YAML → ok:false (no throw)', () => {
    expect(() => composeToRun('::: not : valid : yaml :::')).not.toThrow();
    const r = composeToRun('- just\n- a\n- list');
    expect(r.ok).toBe(false);
  });

  it('a services block with no image → ok:false', () => {
    const r = composeToRun('services:\n  web:\n    ports:\n      - "80:80"\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/image/i);
  });

  it('empty services mapping → ok:false', () => {
    const r = composeToRun('services: {}\n');
    expect(r.ok).toBe(false);
  });

  it('non-string input → ok:false (no throw)', () => {
    expect(() => composeToRun(undefined as unknown as string)).not.toThrow();
    expect(composeToRun(42 as unknown as string).ok).toBe(false);
  });
});

describe('round-trip-ish equivalence', () => {
  it('run → compose → run preserves the essential fields', () => {
    const cmd =
      'docker run --name web -p 8080:80 -e FOO=bar -v /data:/srv:ro --restart always nginx:alpine';
    const compose = runToCompose(cmd);
    expect(compose.ok).toBe(true);

    const back = composeToRun(compose.yaml!);
    expect(back.ok).toBe(true);
    const c = back.command!;
    expect(c).toContain('--name web');
    expect(c).toContain('-p 8080:80');
    expect(c).toContain('-e FOO=bar');
    expect(c).toContain('-v /data:/srv:ro');
    expect(c).toContain('--restart always');
    expect(c).toContain('nginx:alpine');
  });

  it('compose → run → compose keeps the image and ports', () => {
    const yaml = `services:
  api:
    image: myorg/api:1.4.0
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
`;
    const run = composeToRun(yaml);
    expect(run.ok).toBe(true);

    const compose2 = runToCompose(run.command!);
    expect(compose2.ok).toBe(true);
    expect(compose2.yaml!).toContain('image: myorg/api:1.4.0');
    expect(compose2.yaml!).toContain('- "3000:3000"');
    expect(compose2.yaml!).toContain('- NODE_ENV=production');
  });
});

describe('bundled examples — runToCompose round-trips to the expected structure', () => {
  for (const ex of examples) {
    it(`${ex.id}: run → compose recovers the same service fields`, () => {
      const fromRun = runToCompose(ex.run);
      expect(fromRun.ok).toBe(true);
      // The bundled `compose` and the engine's output must agree on the
      // essential fields when both are parsed back to a docker run line.
      const expected = composeToRun(ex.compose);
      const actual = composeToRun(fromRun.yaml!);
      expect(expected.ok).toBe(true);
      expect(actual.ok).toBe(true);

      const norm = (cmd: string) =>
        new Set(cmd.split(' ').filter((t) => t !== '' && t !== '-d'));
      // Every token the bundled compose produces must appear in the engine's
      // run line (order-independent, ignoring the detach flag).
      for (const tok of norm(expected.command!)) {
        expect(actual.command!).toContain(tok);
      }
    });
  }

  it('ubuntu example: command args after the image are not corrupted', () => {
    const ubuntu = examples.find((e) => e.id === 'ubuntu');
    expect(ubuntu).toBeTruthy();
    const r = runToCompose(ubuntu!.run);
    expect(r.ok).toBe(true);
    const y = r.yaml!;
    expect(y).toContain('- bash');
    expect(y).toContain('- "-lc"'); // leading `-` → quoted, but preserved
    expect(y).toContain('- echo hello');
    // No phantom label from the `-lc` bundle being re-parsed.
    expect(y).not.toContain('labels');
  });
});

// `decodeState()` touches `window.location` and is untested here — this
// project's vitest config runs under the `node` environment (no DOM), matching
// the existing untested `ip-hash.ts`/AlertLint precedent. It's exercised
// manually/via the browser instead.
describe('encodeState — pure output', () => {
  it('encodes dir + text into a "#s=" base64url fragment', () => {
    const hash = encodeState('run', 'docker run nginx');
    expect(hash.startsWith('#s=')).toBe(true);
    const decoded = base64UrlDecode(hash.slice('#s='.length));
    expect(JSON.parse(decoded)).toEqual({ dir: 'run', text: 'docker run nginx' });
  });

  it('round-trips the "compose" direction and multi-line text', () => {
    const yamlText = 'services:\n  web:\n    image: nginx\n';
    const hash = encodeState('compose', yamlText);
    const decoded = JSON.parse(base64UrlDecode(hash.slice('#s='.length)));
    expect(decoded).toEqual({ dir: 'compose', text: yamlText });
  });

  it('produces a URL-safe fragment with no base64 padding/unsafe characters', () => {
    const hash = encodeState('run', 'docker run --name a-very-long-container-name nginx:alpine');
    expect(hash.slice('#s='.length)).not.toMatch(/[+/=]/);
  });
});
