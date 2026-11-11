// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const logger = require('../services/logger')
const { verifyGithubWebhook } = require('../services/webhookAuth')

const DEDUPE_WINDOW_MS = 2000
let runningWebhooks = []

function isRedundantWebhook(req) {
    if (req.args.pull_request && req.args.pull_request.html_url) {
        const url = req.args.pull_request.html_url
        if (runningWebhooks.indexOf(url) >= 0) {
            return true
        }
        runningWebhooks.push(url)
        setTimeout(() => {
            runningWebhooks = runningWebhooks.filter(e => e !== url)
        }, DEDUPE_WINDOW_MS)
        return false
    }
    return false
}

function resetDedupeState() {
    runningWebhooks = []
}

function rejectUnsigned(req, res, reason) {
    const repo = req.params && req.params.repo ? req.params.repo : undefined
    logger.warn({
        route: req.path,
        repo: repo,
        event: req.get('X-GitHub-Event'),
        sourceIp: req.ip,
        reason: reason
    }, 'Rejected GitHub webhook: signature verification failed')
    return res.status(401).send('Cannot verify webhook signature')
}

/**
 * Single entry point for both GitHub webhook routes.
 * The signature is verified before any event dispatch, database access or
 * GitHub API call happens.
 */
async function dispatchWebhook(req, res, hooks, options) {
    const secret = options && options.secret !== undefined ? options.secret : undefined
    const check = await verifyGithubWebhook(req, secret)
    if (!check.ok) {
        return rejectUnsigned(req, res, check.reason)
    }

    const event = req.get('X-GitHub-Event')
    const hook = event ? hooks[event] : undefined
    if (!hook) {
        // Signature is valid, so this is a genuine GitHub delivery. Acknowledge
        // events we do not handle (check_suite, installation, ...) with 204 so
        // GitHub does not mark the delivery as failed and disable the webhook.
        logger.debug({ event: event, route: req.path }, 'Ignoring unsupported GitHub event')
        return res.status(204).send('This webhook performed no action')
    }
    if (!hook.accepts(req)) {
        return res.status(204).send('This webhook performed no action')
    }
    if (isRedundantWebhook(req)) {
        logger.info(`Skip redundant webhook for the PR ${req.args.pull_request.html_url} on PR action "${req.args.action}"`)
        return res.status(202).send('This seems to be a redundant webhook. Probably there are two webhooks registered: org- and repo-webhook')
    }
    try {
        await hook.handle(req, res)
    } catch (err) {
        logger.warn(err)
        if (!res.headersSent) {
            res.status(500).send('Internal Server Error')
        }
    }
}

module.exports = {
    dispatchWebhook,
    isRedundantWebhook,
    resetDedupeState
}
