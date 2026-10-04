import { describe, expect, it } from 'vitest';
import catalog from '../../data/iam-catalog.json';
import type { Catalog } from './types';

const cat = catalog as unknown as Catalog;
const LEVELS = ['List', 'Read', 'Write', 'Permissions management', 'Tagging'];
const SERVICES = ['dynamodb', 'ec2', 'ecr', 'iam', 'kms', 'lambda', 'logs', 's3', 'secretsmanager', 'sns', 'sqs', 'sts'];

describe('iam-catalog.json', () => {
  it('has the 12 services, keyed by prefix', () => {
    expect(Object.keys(cat.services).sort()).toEqual(SERVICES);
    for (const [k, s] of Object.entries(cat.services)) {
      expect(s.prefix).toBe(k);
      expect(s.name).toBeTruthy();
      expect(s.actions.length).toBeGreaterThan(0);
    }
  });

  it('generatedAt is an ISO date and source is credited', () => {
    expect(cat.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(cat.generatedAt))).toBe(false);
    expect(cat.source).toContain('servicereference.us-east-1.amazonaws.com');
  });

  it('every action has a known access level and resolvable resource types', () => {
    for (const s of Object.values(cat.services)) {
      const names = new Set(s.resources.map((r) => r.name));
      for (const a of s.actions) {
        expect(LEVELS, `${s.prefix}:${a.n}`).toContain(a.l);
        for (const r of a.r) {
          if (r === '' || r === '*') continue;
          expect(names.has(r), `${s.prefix}:${a.n} -> ${r}`).toBe(true);
        }
      }
    }
  });

  it('actions are sorted and unique per service', () => {
    for (const s of Object.values(cat.services)) {
      const ns = s.actions.map((a) => a.n);
      expect(ns).toEqual([...ns].sort());
      expect(new Set(ns).size).toBe(ns.length);
    }
  });

  it('pins known S3 access levels', () => {
    const s3 = new Map(cat.services.s3.actions.map((a) => [a.n, a]));
    expect(s3.get('GetObject')?.l).toBe('Read');
    expect(s3.get('GetObject')?.r).toContain('object');
    expect(s3.get('PutBucketPolicy')?.l).toBe('Permissions management');
    expect(s3.get('ListAllMyBuckets')?.l).toBe('List');
    expect(s3.get('PutObject')?.l).toBe('Write');
  });
});
