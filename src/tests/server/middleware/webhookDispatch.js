// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const assert = require('assert')
const express = require('express')
const request = require('supertest')
const sinon = require('sinon')
const { sign } = require('@octokit/webhooks-methods')

const { rawBodySaver } = require('../../../server/src/services/webhookAuth')
const { dispatchWebhook, resetDedupeState } = require('../../../server/src/middleware/webhookDispatch')
const bodyParserErrors = require('../../../server/src/middleware/bodyParserErrors')
const param = require('../../../server/src/middleware/param')

const SECRET = 'unit-test-webhook-secret'
const PING_BODY = '{"zen":"Keep it simple.","hook_id":1}'

function buildApp(hooks) {
    const app = express()
    app.use(express.json({ verify: rawBodySaver }))
    app.use('/github', param)
    const handler = (req, res) => dispatchWebhook(req, res, hooks, { secret: SECRET })
    app.all('/github/webhooks', handler)
    app.all('/github/webhook/:repo', handler)
    app.use(bodyParserErrors)
    return app
}

function post(app, path, event, body, headers) {
    const req = request(app).post(path).ok(() => true)
        .set('Content-Type', 'application/json')
        .set('X-GitHub-Event', event)
    Object.keys(headers || {}).forEach(name => req.set(name, headers[name]))
    return req.send(body)
}

function pullRequestBody(htmlUrl) {
    return JSON.stringify({
        action: 'opened',
        repository: { full_name: 'test/test' },
        pull_request: { number: 1, html_url: htmlUrl }
    })
}

async function signedHeaders(body) {
    return { 'X-Hub-Signature-256': await sign(SECRET, body) }
}

describe('github webhook dispatch', function () {
    let hooks
    let ping
    let pullRequest

    beforeEach(function () {
        resetDedupeState()
        ping = {
            accepts: () => true,
            handle: (req, res) => res.status(200).send('OK')
        }
        pullRequest = {
            accepts: () => true,
            handle: (req, res) => res.status(204).send('handled')
        }
        hooks = { ping: ping, pull_request: pullRequest }
    })

    it('should accept a signed ping on the App route', async function () {
        const response = await post(buildApp(hooks), '/github/webhooks', 'ping', PING_BODY, await signedHeaders(PING_BODY))
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.text, 'OK')
    })

    it('should accept a signed ping on the legacy repo route', async function () {
        const response = await post(buildApp(hooks), '/github/webhook/tidb', 'ping', PING_BODY, await signedHeaders(PING_BODY))
        assert.strictEqual(response.status, 200)
    })

    it('should reject an unsigned request on the App route without dispatching', async function () {
        const handle = sinon.spy(ping, 'handle')
        const response = await post(buildApp(hooks), '/github/webhooks', 'ping', PING_BODY)
        assert.strictEqual(response.status, 401)
        assert.strictEqual(handle.called, false)
    })

    it('should reject an unsigned request on the legacy repo route', async function () {
        const body = pullRequestBody('https://github.com/test/test/pull/1')
        const response = await post(buildApp(hooks), '/github/webhook/tidb', 'pull_request', body)
        assert.strictEqual(response.status, 401)
        assert.strictEqual(response.text, 'Cannot verify webhook signature')
    })

    it('should reject a legacy sha1-only signature', async function () {
        const response = await post(buildApp(hooks), '/github/webhook/tidb', 'ping', PING_BODY, {
            'X-Hub-Signature': 'sha1=0123456789abcdef0123456789abcdef01234567'
        })
        assert.strictEqual(response.status, 401)
    })

    it('should reject a valid signature computed with a different secret', async function () {
        const signature = await sign('another-secret', PING_BODY)
        const response = await post(buildApp(hooks), '/github/webhook/tidb', 'ping', PING_BODY, {
            'X-Hub-Signature-256': signature
        })
        assert.strictEqual(response.status, 401)
    })

    it('should return 400 for malformed JSON instead of crashing', async function () {
        const raw = '{"zen":'
        const response = await post(buildApp(hooks), '/github/webhook/tidb', 'ping', raw, await signedHeaders(raw))
        assert.strictEqual(response.status, 400)
        assert.deepStrictEqual(response.body, { error: 'Invalid JSON payload' })
    })

    it('should acknowledge an unsupported event with 204 when the signature is valid', async function () {
        const raw = '{"ref":"refs/heads/main"}'
        const response = await post(buildApp(hooks), '/github/webhook/tidb', 'push', raw, await signedHeaders(raw))
        assert.strictEqual(response.status, 204)
        assert.strictEqual(response.text, '')
    })

    it('should return 204 when the handler does not accept the event', async function () {
        hooks.pull_request = { accepts: () => false, handle: () => { throw new Error('must not be called') } }
        const body = pullRequestBody('https://github.com/test/test/pull/2')
        const response = await post(buildApp(hooks), '/github/webhook/tidb', 'pull_request', body, await signedHeaders(body))
        assert.strictEqual(response.status, 204)
    })

    it('should survive a handler rejection and keep serving requests', async function () {
        hooks.pull_request = {
            accepts: () => true,
            handle: async () => {
                throw new Error('handler exploded')
            }
        }
        const app = buildApp(hooks)
        const body = pullRequestBody('https://github.com/test/test/pull/3')
        const failed = await post(app, '/github/webhook/tidb', 'pull_request', body, await signedHeaders(body))
        assert.strictEqual(failed.status, 500)

        const after = await post(app, '/github/webhook/tidb', 'ping', PING_BODY, await signedHeaders(PING_BODY))
        assert.strictEqual(after.status, 200)
    })

    it('should answer duplicate deliveries with 202', async function () {
        const body = pullRequestBody('https://github.com/test/test/pull/4')
        const headers = await signedHeaders(body)
        const app = buildApp(hooks)
        const first = await post(app, '/github/webhook/tidb', 'pull_request', body, headers)
        const second = await post(app, '/github/webhook/tidb', 'pull_request', body, headers)
        assert.strictEqual(first.status, 204)
        assert.strictEqual(second.status, 202)
    })
})
