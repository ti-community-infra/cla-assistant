// SPDX-FileCopyrightText: 2022 SAP SE or an SAP affiliate company and CLA-assistant contributors
//
// SPDX-License-Identifier: Apache-2.0

/*global describe, it, afterEach*/

const assert = require('assert')
const sinon = require('sinon')

global.config = require('../../../server/src/config')

const cla = require('../../../server/src/services/cla')
const repoService = require('../../../server/src/services/repo')
const orgService = require('../../../server/src/services/org')

const badRequest = (err, field) => {
    return err && err.status === 400 && new RegExp(field).test(err.message)
}

describe('cla.getLinkedItem input validation', () => {
    afterEach(() => {
        sinon.restore()
    })

    it('rejects an object repoId before any GitHub or database query', async () => {
        const getGHRepo = sinon.stub(repoService, 'getGHRepo')
        const getRepo = sinon.stub(repoService, 'get')

        await assert.rejects(
            cla.getLinkedItem({ owner: 'pingcap', repo: 'tidb', repoId: { $gt: '' } }),
            (err) => badRequest(err, 'repoId')
        )
        assert.equal(getGHRepo.called, false)
        assert.equal(getRepo.called, false)
    })

    it('rejects an object orgId', async () => {
        const getGHRepo = sinon.stub(repoService, 'getGHRepo')

        await assert.rejects(
            cla.getLinkedItem({ owner: 'pingcap', repo: 'tidb', orgId: { $ne: null } }),
            (err) => badRequest(err, 'orgId')
        )
        assert.equal(getGHRepo.called, false)
    })

    it('rejects a non-string owner', async () => {
        await assert.rejects(
            cla.getLinkedItem({ owner: { $ne: null }, repo: 'tidb' }),
            (err) => badRequest(err, 'owner')
        )
    })

    it('rejects an array repo name', async () => {
        await assert.rejects(
            cla.getLinkedItem({ owner: 'pingcap', repo: ['tidb'] }),
            (err) => badRequest(err, 'repo')
        )
    })

    it('rejects a repoId that does not match the resolved owner/repo', async () => {
        sinon.stub(repoService, 'getGHRepo').resolves({ id: 41986369, owner: { id: 123 } })
        const getRepo = sinon.stub(repoService, 'get')

        await assert.rejects(
            cla.getLinkedItem({ owner: 'pingcap', repo: 'tidb', repoId: 999 }),
            (err) => badRequest(err, 'repoId')
        )
        assert.equal(getRepo.called, false)
    })

    it('resolves a repo when the supplied ids match owner/repo', async () => {
        sinon.stub(repoService, 'getGHRepo').resolves({ id: 41986369, owner: { id: 123 } })
        const getRepo = sinon.stub(repoService, 'get').resolves({ owner: 'pingcap', repo: 'tidb', repoId: 41986369 })

        const item = await cla.getLinkedItem({
            owner: 'pingcap',
            repo: 'tidb',
            repoId: '41986369',
            orgId: 123
        })

        assert.equal(item.repo, 'tidb')
        assert.deepEqual(getRepo.firstCall.args[0], { repoId: 41986369 })
    })

    it('self-heals a linked repo that was renamed on GitHub', async () => {
        sinon.stub(repoService, 'getGHRepo').resolves({ id: 1294565269, owner: { id: 42 } })
        const save = sinon.stub().resolves()
        const linkedRepo = { owner: 'tidbcloud', repo: 'tdc', repoId: 1294565269, save }
        sinon.stub(repoService, 'get').resolves(linkedRepo)

        const item = await cla.getLinkedItem({ owner: 'tidbcloud', repo: 'ti-cli' })

        assert.equal(item, linkedRepo)
        assert.equal(item.owner, 'tidbcloud')
        assert.equal(item.repo, 'ti-cli')
        assert.equal(save.calledOnce, true)
    })

    it('self-heals a linked repo transferred to another owner', async () => {
        sinon.stub(repoService, 'getGHRepo').resolves({ id: 1294565269, owner: { id: 42 } })
        const save = sinon.stub().resolves()
        const linkedRepo = { owner: 'old-org', repo: 'ti-cli', repoId: 1294565269, save }
        sinon.stub(repoService, 'get').resolves(linkedRepo)

        await cla.getLinkedItem({ owner: 'tidbcloud', repo: 'ti-cli' })

        assert.equal(linkedRepo.owner, 'tidbcloud')
        assert.equal(save.calledOnce, true)
    })

    it('resolves a repo without supplied ids', async () => {
        sinon.stub(repoService, 'getGHRepo').resolves({ id: 41986369, owner: { id: 123 } })
        sinon.stub(repoService, 'get').resolves({ owner: 'pingcap', repo: 'tidb', repoId: 41986369 })

        const item = await cla.getLinkedItem({ owner: 'pingcap', repo: 'tidb' })

        assert.equal(item.repo, 'tidb')
    })

    it('resolves an org-only lookup and rejects a mismatched orgId', async () => {
        sinon.stub(orgService, 'get').resolves({ org: 'pingcap', orgId: 123 })

        const item = await cla.getLinkedItem({ owner: 'pingcap' })
        assert.equal(item.org, 'pingcap')

        await assert.rejects(
            cla.getLinkedItem({ owner: 'pingcap', orgId: 999 }),
            (err) => badRequest(err, 'orgId')
        )
    })
})
