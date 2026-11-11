// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const assert = require('assert')
const { execFileSync } = require('child_process')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../../../..')

describe('server module graph', function () {
    it('should load the webhook middleware without global.config', function () {
        const script = "require('./src/server/src/middleware/webhookDispatch'); require('./src/server/src/middleware/bodyParserErrors')"
        const output = execFileSync(process.execPath, ['-e', script], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        })
        assert.strictEqual(output.trim(), '')
    })
})
