// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

/*global describe, it*/

const assert = require('assert')

const { DEFAULT_SESSION_SECRET, validateSessionSecret } = require('../../../server/src/services/session')

describe('validateSessionSecret', () => {
    it('falls back to the development default outside production', () => {
        assert.equal(validateSessionSecret(undefined, 'development'), DEFAULT_SESSION_SECRET)
        assert.equal(validateSessionSecret('dev-secret', 'test'), 'dev-secret')
    })

    it('requires a non-default secret in production', () => {
        assert.throws(
            () => validateSessionSecret(undefined, 'production'),
            /SESSION_SECRET must be set/
        )
        assert.throws(
            () => validateSessionSecret(DEFAULT_SESSION_SECRET, 'production'),
            /must not use the default value/
        )
    })

    it('accepts an explicit production secret', () => {
        assert.equal(validateSessionSecret('a-random-production-secret', 'production'), 'a-random-production-secret')
    })
})
