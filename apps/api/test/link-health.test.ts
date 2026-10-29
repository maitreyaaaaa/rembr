import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPublicPage, type ResponsePayload, type ValidatedUrl } from '../src/items/safe-fetch.js';

function response(statusCode: number, location?: string): ResponsePayload {
  return { statusCode, location, contentType: '', body: '' };
}

const validate = async (input: string): Promise<ValidatedUrl> => ({ url: new URL(input), address: '93.184.216.34', family: 4 });

test('link check safely revalidates every redirect and marks only confirmed not-found responses broken', async () => {
  const checkedUrls: string[] = [];
  const result = await checkPublicPage('https://example.com/saved', {
    validateUrl: validate,
    requestProbe: async (target) => {
      checkedUrls.push(target.url.toString());
      return target.url.pathname === '/saved' ? response(302, '/moved') : response(404);
    },
  });
  assert.deepEqual(checkedUrls, ['https://example.com/saved', 'https://example.com/moved']);
  assert.equal(result.status, 'broken');
  assert.equal(result.httpStatus, 404);
  assert.equal(result.finalUrl, 'https://example.com/moved');
});

test('link check retries servers that do not support HEAD with a bounded GET probe', async () => {
  const methods: string[] = [];
  const result = await checkPublicPage('https://example.com/page', {
    validateUrl: validate,
    requestProbe: async (_target, method) => {
      methods.push(method);
      return method === 'HEAD' ? response(405) : response(200);
    },
  });
  assert.deepEqual(methods, ['HEAD', 'GET']);
  assert.equal(result.status, 'ok');
  assert.equal(result.httpStatus, 200);
});

test('link check reports network and unsafe redirect failures as unknown', async () => {
  const validated: string[] = [];
  const result = await checkPublicPage('https://example.com/start', {
    validateUrl: async (input) => {
      validated.push(input);
      if (input.startsWith('http://127.0.0.1')) throw new Error('private target blocked');
      return validate(input);
    },
    requestProbe: async () => response(302, 'http://127.0.0.1/private'),
  });
  assert.deepEqual(validated, ['https://example.com/start', 'http://127.0.0.1/private']);
  assert.equal(result.status, 'unknown');
  assert.equal(result.errorMessage, 'This link could not be checked safely right now.');
});

test('link check reports transient server failures as unknown', async () => {
  const result = await checkPublicPage('https://example.com/page', { validateUrl: validate, requestProbe: async () => response(503) });
  assert.equal(result.status, 'unknown');
  assert.equal(result.httpStatus, 503);
});
