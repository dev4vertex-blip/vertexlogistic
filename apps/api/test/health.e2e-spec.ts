import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { validateEnvironment } from '../src/config/env.validation.js';

describe('VERTEX Logistics API - Foundation & Health Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Test 1: Health endpoint returns HTTP 200
  it('1. GET /api/health should return HTTP 200 OK', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
  });

  // Test 2: Response follows the expected contract exactly
  it('2. GET /api/health response body should match HealthResponse contract', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.body).toEqual({
      status: 'ok',
      service: 'vertex-logistics-api',
      version: '0.1.0',
    });
    // Strict contract assertions
    expect(typeof res.body.status).toBe('string');
    expect(typeof res.body.service).toBe('string');
    expect(typeof res.body.version).toBe('string');
  });

  // Test 3: Invalid configuration fails startup safely
  it('3. validateEnvironment should fail startup safely on invalid PORT or NODE_ENV', () => {
    // Test invalid port string
    expect(() => validateEnvironment({ PORT: 'not-a-number' })).toThrowError(/PORT must be an integer/);
    // Test port out of range
    expect(() => validateEnvironment({ PORT: '999999' })).toThrowError(/between 1 and 65535/);
    // Test invalid NODE_ENV
    expect(() => validateEnvironment({ NODE_ENV: 'staging-unknown' })).toThrowError(/Invalid NODE_ENV/);
  });

  // Test 4: Unknown routes return appropriate HTTP errors (HTTP 404)
  it('4. GET /api/unknown-route should return HTTP 404 with structured error', async () => {
    const res = await request(app.getHttpServer()).get('/api/non-existent-route-999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('statusCode', 404);
    expect(res.body).toHaveProperty('error', 'Not Found');
    expect(res.body).toHaveProperty('path', '/api/non-existent-route-999');
    expect(res.body).toHaveProperty('timestamp');
  });

  // Test 5: Unexpected errors do not expose stack traces or internal details
  it('5. Error responses must never expose stack traces or process internals', async () => {
    const res = await request(app.getHttpServer()).get('/api/non-existent-route-999');
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('trace');
    expect(res.body).not.toHaveProperty('env');
    expect(res.body).not.toHaveProperty('process');
  });

  // Test 6: Security headers are correctly set
  it('6. Security headers should be present on HTTP responses', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  // Test 7: GET /api/health/ready returns HTTP 200 with structured database status
  it('7. GET /api/health/ready should return structured readiness response', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('service', 'vertex-logistics-api');
    expect(res.body).toHaveProperty('version', '0.1.0');
    expect(res.body).toHaveProperty('database');
    expect(res.body.database).toHaveProperty('service', 'postgresql');
    expect(res.body.database).toHaveProperty('status');
  });

  // Test 8: Readiness response must never expose connection strings, passwords, or internal hostnames
  it('8. Readiness checks must never expose database credentials or connection strings', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/ready');
    const rawResponse = JSON.stringify(res.body);
    expect(rawResponse).not.toContain('postgresql://');
    expect(rawResponse).not.toContain('postgres://');
    expect(rawResponse).not.toContain('password');
    expect(rawResponse).not.toContain('secret');
  });
});

