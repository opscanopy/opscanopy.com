/**
 * URL Encoder / Decoder — bundled examples, one per chip.
 *
 * Six cases, chosen to cover the three modes and the mistakes that actually
 * cost people an afternoon: a webhook callback whose params hide a `#` and a
 * `=`, UTM tracking with repeated and `[]`-suffixed keys, a double-encoded
 * OAuth `redirect_uri`, encoding a redirect target correctly in the first place,
 * an IDN host that becomes punycode, and a form body where `+` means space.
 *
 * Examples deliberately set only `mode`, never the per-mode checkboxes: the
 * defaults (`+ is a space` on auto, RFC 3986 component scope) already reproduce
 * every one of them, which is what lets the `#in=…&mode=…` deep link restore a
 * chip exactly without carrying the option state.
 */
import type { UrlCodecExample } from './types';

export const examples: UrlCodecExample[] = [
  {
    id: 'webhook',
    label: 'Webhook callback',
    mode: 'parse',
    input:
      'https://hooks.example.com/services/T024%2FB01/relay?channel=%23alerts&token=abc%3D%3D&text=Deploy%20failed%20on%20api-7',
  },
  {
    id: 'utm',
    label: 'UTM + repeated keys',
    mode: 'parse',
    input:
      'https://opscanopy.com/tools/?utm_source=newsletter&utm_medium=email&utm_campaign=q3%20launch&tags[]=devops&tags[]=sre&utm_source=twitter',
  },
  {
    id: 'double',
    label: 'Double-encoded redirect',
    mode: 'decode',
    input:
      'https%3A%2F%2Flogin.example.com%2Foauth%2Fauthorize%3Fredirect_uri%3Dhttps%253A%252F%252Fapp.example.com%252Fcallback',
  },
  {
    id: 'redirect-uri',
    label: 'Encode a redirect_uri',
    mode: 'encode',
    input: 'https://app.example.com/oauth/callback?tenant=acme&next=/settings?tab=billing',
  },
  {
    id: 'idn',
    label: 'IDN host → punycode',
    mode: 'parse',
    input: 'https://münchen.example/straße/preise?q=café&sort=preis',
  },
  {
    id: 'form-body',
    label: 'Form body (+ as space)',
    mode: 'decode',
    input: 'name=Ada+Lovelace&role=site+reliability&note=100%25+uptime%3F&team=',
  },
];
