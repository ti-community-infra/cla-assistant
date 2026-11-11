// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const { verify } = require('@octokit/webhooks-methods')

const SIGNATURE_HEADER = 'X-Hub-Signature-256'
const SIGNATURE_PATTERN = /^sha256=[0-9a-f]{64}$/i
const PLACEHOLDER_SECRETS = ['changeme', 'change-me', 'cla-assistant', 'secret']

function isPlaceholderSecret(secret) {
    return PLACEHOLDER_SECRETS.indexOf(String(secret).trim().toLowerCase()) > -1
}

/**
 * Resolve the shared GitHub webhook secret. Production must provide an
 * explicit, non-placeholder secret; otherwise the process fails closed at
 * startup, matching the SESSION_SECRET behaviour.
 */
function validateWebhookSecret(secret, env = process.env.NODE_ENV) {
    if (env !== 'production') {
        return secret || ''
    }
    if (!secret) {
        throw new Error('GITHUB_APP_WEBHOOK_SECRET must be set in production')
    }
    if (isPlaceholderSecret(secret)) {
        throw new Error('GITHUB_APP_WEBHOOK_SECRET must not be a placeholder value in production')
    }
    return secret
}

/**
 * body-parser verify hook. GitHub signs the raw request body, so it has to be
 * kept byte for byte instead of being re-serialised from the parsed JSON.
 */
function rawBodySaver(req, _res, buf) {
    if (buf && buf.length) {
        req.rawBody = buf
    }
}

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 * Returns {ok: true} or {ok: false, reason}, never throws.
 */
async function verifyGithubWebhook(req, secret) {
    if (!secret) {
        return { ok: false, reason: 'no_secret' }
    }
    const signature = typeof req.get === 'function' ? req.get(SIGNATURE_HEADER) : undefined
    if (!signature) {
        return { ok: false, reason: 'missing' }
    }
    if (!SIGNATURE_PATTERN.test(signature)) {
        return { ok: false, reason: 'malformed' }
    }
    const payload = Buffer.isBuffer(req.rawBody) ? req.rawBody : null
    if (!payload || payload.length === 0) {
        return { ok: false, reason: 'missing_body' }
    }
    try {
        const matched = await verify(secret, payload, signature)
        return matched ? { ok: true } : { ok: false, reason: 'mismatch' }
    } catch (err) {
        return { ok: false, reason: 'malformed' }
    }
}

module.exports = {
    SIGNATURE_HEADER,
    isPlaceholderSecret,
    validateWebhookSecret,
    rawBodySaver,
    verifyGithubWebhook
}
