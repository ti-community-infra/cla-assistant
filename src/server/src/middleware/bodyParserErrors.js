// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const logger = require('../services/logger')

/**
 * Express error handler for request-body parsing failures and unexpected
 * handler errors. Never leaks a stack trace and never re-throws: an
 * unhandled rejection would terminate the process.
 */
function bodyParserErrors(err, req, res, next) {
    if (res.headersSent) {
        return next(err)
    }
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
        return res.status(400).json({ error: 'Invalid JSON payload' })
    }
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Payload too large' })
    }
    logger.warn(err)
    return res.status(500).json({ error: 'Internal Server Error' })
}

module.exports = bodyParserErrors
