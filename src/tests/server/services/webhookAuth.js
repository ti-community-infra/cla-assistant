// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const assert = require('assert')
const { sign } = require('@octokit/webhooks-methods')

const webhookAuth = require('../../../server/src/services/webhookAuth')

const SECRET = 'unit-test-webhook-secret'
const BODY = '{"zen":"Keep it simple.","hook_id":1}'

function fakeReq(rawBody, headers) {
    return {
        rawBody: rawBody,
        get: (name) => headers[name]
    }
}

describe('webhookAuth', function () {
    describe('validateWebhookSecret', function () {
        it('should allow a missing secret outside production', function () {
            assert.strictEqual(webhookAuth.validateWebhookSecret(undefined, 'development'), '')
            assert.strictEqual(webhookAuth.validateWebhookSecret('', 'test'), '')
        })

        it('should fail closed when production secret is missing', function () {
            assert.throws(() => webhookAuth.validateWebhookSecret(undefined, 'production'), /must be set in production/)
            assert.throws(() => webhookAuth.validateWebhookSecret('', 'production'), /must be set in production/)
        })

        it('should fail closed when production secret is a placeholder', function () {
            assert.throws(() => webhookAuth.validateWebhookSecret('changeme', 'production'), /placeholder/)
            assert.throws(() => webhookAuth.validateWebhookSecret('cla-assistant', 'production'), /placeholder/)
        })

        it('should accept a real production secret', function () {
            assert.strictEqual(webhookAuth.validateWebhookSecret(SECRET, 'production'), SECRET)
        })
    })

    describe('rawBodySaver', function () {
        it('should keep the raw bytes of a non-empty body', function () {
            const req = {}
            webhookAuth.rawBodySaver(req, {}, Buffer.from(BODY))
            assert.strictEqual(req.rawBody.toString(), BODY)
        })

        it('should not set rawBody for an empty body', function () {
            const req = {}
            webhookAuth.rawBodySaver(req, {}, Buffer.alloc(0))
            assert.strictEqual(req.rawBody, undefined)
        })
    })

    describe('verifyGithubWebhook', function () {
        it('should accept a valid sha256 signature over the raw body', async function () {
            const signature = await sign(SECRET, BODY)
            const result = await webhookAuth.verifyGithubWebhook(
                fakeReq(Buffer.from(BODY), { 'X-Hub-Signature-256': signature }),
                SECRET
            )
            assert.deepStrictEqual(result, { ok: true })
        })

        it('should reject a signature computed with another secret', async function () {
            const signature = await sign('another-secret', BODY)
            const result = await webhookAuth.verifyGithubWebhook(
                fakeReq(Buffer.from(BODY), { 'X-Hub-Signature-256': signature }),
                SECRET
            )
            assert.deepStrictEqual(result, { ok: false, reason: 'mismatch' })
        })

        it('should reject a body that was changed after signing', async function () {
            const signature = await sign(SECRET, BODY)
            const result = await webhookAuth.verifyGithubWebhook(
                fakeReq(Buffer.from(BODY.replace('Keep', 'Change')), { 'X-Hub-Signature-256': signature }),
                SECRET
            )
            assert.deepStrictEqual(result, { ok: false, reason: 'mismatch' })
        })

        it('should reject a missing signature header', async function () {
            const result = await webhookAuth.verifyGithubWebhook(fakeReq(Buffer.from(BODY), {}), SECRET)
            assert.deepStrictEqual(result, { ok: false, reason: 'missing' })
        })

        it('should reject a legacy sha1 signature header', async function () {
            const result = await webhookAuth.verifyGithubWebhook(
                fakeReq(Buffer.from(BODY), { 'X-Hub-Signature-256': 'sha1=0123456789abcdef0123456789abcdef01234567' }),
                SECRET
            )
            assert.deepStrictEqual(result, { ok: false, reason: 'malformed' })
        })

        it('should reject a malformed signature without throwing', async function () {
            const result = await webhookAuth.verifyGithubWebhook(
                fakeReq(Buffer.from(BODY), { 'X-Hub-Signature-256': 'sha256=not-hex' }),
                SECRET
            )
            assert.deepStrictEqual(result, { ok: false, reason: 'malformed' })
        })

        it('should reject an empty raw body', async function () {
            const signature = 'sha256=' + '0'.repeat(64)
            const result = await webhookAuth.verifyGithubWebhook(
                fakeReq(undefined, { 'X-Hub-Signature-256': signature }),
                SECRET
            )
            assert.deepStrictEqual(result, { ok: false, reason: 'missing_body' })
        })

        it('should reject when no secret is configured', async function () {
            const signature = await sign(SECRET, BODY)
            const result = await webhookAuth.verifyGithubWebhook(
                fakeReq(Buffer.from(BODY), { 'X-Hub-Signature-256': signature }),
                ''
            )
            assert.deepStrictEqual(result, { ok: false, reason: 'no_secret' })
        })
    })
})
