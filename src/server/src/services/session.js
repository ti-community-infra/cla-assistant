// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_SESSION_SECRET = 'cla-assistant'

/**
 * Resolve the express-session secret. Production must provide an explicit,
 * non-default secret; otherwise the process fails closed at startup.
 */
function validateSessionSecret(secret, env = process.env.NODE_ENV) {
    if (env !== 'production') {
        return secret || DEFAULT_SESSION_SECRET
    }
    if (!secret) {
        throw new Error('SESSION_SECRET must be set in production')
    }
    if (secret === DEFAULT_SESSION_SECRET) {
        throw new Error('SESSION_SECRET must not use the default value in production')
    }
    return secret
}

module.exports = {
    DEFAULT_SESSION_SECRET,
    validateSessionSecret
}
