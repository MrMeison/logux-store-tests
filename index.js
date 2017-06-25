'use strict'

const assert = require('assert')
/**
 * Pass all common tests for Logux store to callback.
 *
 * @param {creator} test Callback to create tests in your test framework.
 *
 * @returns {undefined}
 *
 * @example
 * const eachTest = require('logux-store-tests')
 *
 * eachTest((desc, creator) => {
 *   it(desc, creator(() => new CustomStore()))
 * })
 */

function all (request, list) {
  if (!list) list = []
  return request.then(page => {
    list = list.concat(page.entries)
    if (page.next) {
      return all(page.next(), list)
    } else {
      return list
    }
  })
}

function check (storeInstance, order, added) {
  return all(storeInstance.get({ order })).then(entries => {
    expect(entries).toEqual(added)
  })
}

function checkBoth (storeInstance, entries) {
  return Promise.all([
    check(storeInstance, 'created', entries),
    check(storeInstance, 'added', entries)
  ])
}

function nope () { }

module.exports = function eachTest (test) {
  test('is empty in the beginning', storeFactory => () => {
    const store = storeFactory()
    return check(store, 'created', []).then(() => {
      return store.getLastAdded()
    }).then(added => {
      assert.equal(added, 0)
      return store.getLastSynced()
    }).then(synced => {
      assert.deepEqual(synced, { sent: 0, received: 0 })
    })
  })

  test('updates latest sent value', storeFactory => () => {
    const store = storeFactory()
    return store.setLastSynced({ sent: 1 }).then(() => {
      return store.getLastSynced()
    }).then(synced => {
      return assert.deepEqual(synced, { sent: 1, received: 0 })
    })
  })

  test('stores entries sorted', storeFactory => () => {
    const store = storeFactory()
    return Promise.all([
      store.add({ type: '1' }, { id: [1, 'a'], time: 1 }),
      store.add({ type: '2' }, { id: [1, 'c'], time: 2 }),
      store.add({ type: '3' }, { id: [1, 'b'], time: 2 })
    ]).then(() => {
      return checkBoth(store, [
        [{ type: '2' }, { added: 2, id: [1, 'c'], time: 2 }],
        [{ type: '3' }, { added: 3, id: [1, 'b'], time: 2 }],
        [{ type: '1' }, { added: 1, id: [1, 'a'], time: 1 }]
      ], [
        [{ type: '3' }, { added: 3, id: [1, 'b'], time: 2 }],
        [{ type: '2' }, { added: 2, id: [1, 'c'], time: 2 }],
        [{ type: '1' }, { added: 1, id: [1, 'a'], time: 1 }]
      ])
    })
  })

  test('returns latest added', storeFactory => () => {
    const store = storeFactory()
    return store.add({ type: 'A' }, { id: [1], time: 1 }).then(() => {
      return store.getLastAdded().then(added => {
        assert.ok(added)
        return store.add({ type: 'A' }, { id: [1] })
      }).then(() => {
        return store.getLastAdded()
      }).then(added => {
        assert.equal(added, 1)
      })
    })
  })

  test('changes meta', storeFactory => () => {
    const store = storeFactory()
    return store.add({ }, { id: [1], time: 1, a: 1 }).then(() => {
      return store.changeMeta([1], { a: 2, b: 2 })
    }).then(result => {
      assert.equal(result, true)
      return checkBoth(store, [
        [{ }, { id: [1], time: 1, added: 1, a: 2, b: 2 }]
      ])
    })
  })

  test('resolves to false on unknown ID in changeMeta', storeFactory => () => {
    const store = storeFactory()
    return store.changeMeta([1], { a: 1 }).then(result => {
      assert.equal(result, false)
    })
  })

  test('removes entries', storeFactory => () => {
    const store = storeFactory()
    return Promise.all([
      store.add({ type: '1' }, { id: [1, 'node1', 0], time: 1 }),
      store.add({ type: '1' }, { id: [1, 'node1', 0], time: 1 }),
      store.add({ type: '2' }, { id: [1, 'node1', 1], time: 2 }),
      store.add({ type: '3' }, { id: [1, 'node1', 2], time: 2 }),
      store.add({ type: '4' }, { id: [1, 'node1', 3], time: 2 }),
      store.add({ type: '5' }, { id: [1, 'node2', 0], time: 2 }),
      store.add({ type: '6' }, { id: [4, 'node1', 0], time: 4 })
    ])
      .then(() => store.remove([1, 'node1', 2]))
      .then(res => {
        assert.deepEqual(res, [
          { type: '3' }, { id: [1, 'node1', 2], time: 2, added: 3 }
        ])
        return checkBoth(store, [
          [{ type: '6' }, { id: [4, 'node1', 0], time: 4, added: 6 }],
          [{ type: '5' }, { id: [1, 'node2', 0], time: 2, added: 5 }],
          [{ type: '4' }, { id: [1, 'node1', 3], time: 2, added: 4 }],
          [{ type: '2' }, { id: [1, 'node1', 1], time: 2, added: 2 }],
          [{ type: '1' }, { id: [1, 'node1', 0], time: 1, added: 1 }]
        ])
      })
  })

  test('ignores unknown entry', storeFactory => () => {
    const store = storeFactory()
    store.add({ }, { id: [1], time: 1, added: 1 })
      .then(() => store.remove([2]))
      .then(result => {
        assert.equal(result, false)
        return check(storeFactory, 'created', [
          [{ }, { id: [1], time: 1, added: 1 }]
        ])
      })
  })

  test('removes reasons and actions without reason', storeFactory => () => {
    const store = storeFactory()
    const removed = []
    return Promise.all([
      store.add({ type: '1' }, { id: [1], time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: [2], time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: [3], time: 3, reasons: ['a', 'b'] }),
      store.add({ type: '4' }, { id: [4], time: 4, reasons: ['b'] })
    ]).then(() => {
      return store.removeReason('a', { }, (action, meta) => {
        removed.push([action, meta])
      })
    }).then(() => {
      return checkBoth(store, [
        [{ type: '4' }, { added: 4, id: [4], time: 4, reasons: ['b'] }],
        [{ type: '3' }, { added: 3, id: [3], time: 3, reasons: ['b'] }]
      ])
    })
  })

  test('removes reason with minimum added', storeFactory => () => {
    const store = storeFactory()
    return Promise.all([
      store.add({ type: '1' }, { id: [1], time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: [2], time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: [3], time: 3, reasons: ['a'] })
    ]).then(() => {
      return store.removeReason('a', { minAdded: 2 }, nope)
    }).then(() => {
      return checkBoth(store, [
        [{ type: '1' }, { added: 1, id: [1], time: 1, reasons: ['a'] }]
      ])
    })
  })

  test('removes reason with maximum added', storeFactory => () => {
    const store = storeFactory()
    return Promise.all([
      store.add({ type: '1' }, { id: [1], time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: [2], time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: [3], time: 3, reasons: ['a'] })
    ]).then(() => {
      return store.removeReason('a', { maxAdded: 2 }, nope)
    }).then(() => {
      return checkBoth(store, [
        [{ type: '3' }, { added: 3, id: [3], time: 3, reasons: ['a'] }]
      ])
    })
  })

  test('removes reason with minimum and maximum added', storeFactory => () => {
    const store = storeFactory()
    return Promise.all([
      store.add({ type: '1' }, { id: [1], time: 1, reasons: ['a'] }),
      store.add({ type: '2' }, { id: [2], time: 2, reasons: ['a'] }),
      store.add({ type: '3' }, { id: [3], time: 3, reasons: ['a'] })
    ]).then(() => {
      return store.removeReason('a', { maxAdded: 2, minAdded: 2 }, nope)
    }).then(() => {
      return checkBoth(store, [
        [{ type: '3' }, { added: 3, id: [3], time: 3, reasons: ['a'] }],
        [{ type: '1' }, { added: 1, id: [1], time: 1, reasons: ['a'] }]
      ])
    })
  })

  test('removes reason with zero at maximum added', storeFactory => () => {
    const store = storeFactory()
    return store.add({ }, { id: [1], time: 1, reasons: ['a'] })
      .then(() => store.removeReason('a', { maxAdded: 0 }, nope))
      .then(() => {
        return checkBoth(store, [
          [{ }, { added: 1, id: [1], time: 1, reasons: ['a'] }]
        ])
      })
  })
}

/**
 * @callback creator
 * @param {string} name The test name.
 * @param {creator} generator The test creator.
 */

/**
 * @callback generator
 * @param {Store} store The store instance.
 * @return {function} The test function to be used in test framework.
 */
