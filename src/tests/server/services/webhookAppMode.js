// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

const assert = require('assert')
const sinon = require('sinon')

const config = require('../../../server/src/config')
const github = require('../../../server/src/services/github')
const webhookService = require('../../../server/src/services/webhook')

describe('webhookService in GitHub App mode', function () {
    let originalAppId
    let originalPrivateKey

    beforeEach(function () {
        originalAppId = config.server.github.app.appId
        originalPrivateKey = config.server.github.app.privateKey
        config.server.github.app.appId = '1350531'
        config.server.github.app.privateKey = 'private-key'
        sinon.stub(github, 'call').resolves({ data: {} })
    })

    afterEach(function () {
        github.call.restore()
        config.server.github.app.appId = originalAppId
        config.server.github.app.privateKey = originalPrivateKey
    })

    it('should not create a repository webhook', async function () {
        const hook = await webhookService.createRepoHook('pingcap', 'tidb', 'token')
        assert.strictEqual(hook.active, true)
        assert.strictEqual(hook.type, 'App')
        assert.strictEqual(github.call.calledWithMatch({ fun: 'createWebhook' }), false)
    })

    it('should report the app-managed webhook as active', async function () {
        const hook = await webhookService.getRepoHook('pingcap', 'tidb', 'token')
        assert.strictEqual(hook.active, true)
        assert.strictEqual(github.call.calledWithMatch({ fun: 'listWebhooks' }), false)
    })

    it('should not remove a repository webhook', async function () {
        const hook = await webhookService.removeRepoHook('pingcap', 'tidb', 'token')
        assert.strictEqual(hook.active, true)
        assert.strictEqual(github.call.calledWithMatch({ fun: 'deleteWebhook' }), false)
    })

    it('should not create an organization webhook', async function () {
        const hook = await webhookService.createOrgHook('pingcap', 'token')
        assert.strictEqual(hook.active, true)
        assert.strictEqual(github.call.calledWithMatch({ fun: 'createWebhook' }), false)
    })
})
