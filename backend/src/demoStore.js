import { AsyncLocalStorage } from 'node:async_hooks'
import * as schemas from './models.js'
import raw from './demoData.json' with { type: 'json' }
import { RequestError } from './ledger.js'

const clone = value => JSON.parse(JSON.stringify(value))
const at = (row, path) => path.split('.').reduce((value, key) => value?.[key], row)
const equal = (a, b) => a == null && b == null || String(a) === String(b)

// Deliberately limited to the query operators used by the shared financial routes.
function matches(row, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some(part => matches(row, part))
    const actual = at(row, key)
    if (expected && typeof expected === 'object' && !expected.toHexString && !(expected instanceof Date)) {
      return Object.entries(expected).every(([operator, value]) => {
        switch (operator) {
          case '$in': return value.some(item => equal(actual, item))
          case '$ne': return !equal(actual, value)
          case '$lt': return actual != null && actual < value
          case '$lte': return actual != null && actual <= value
          case '$gt': return actual != null && actual > value
          case '$gte': return actual != null && actual >= value
          default: throw new Error('Unsupported demo query operator: ' + operator)
        }
      })
    }
    return equal(actual, expected)
  })
}

const collections = { Account: 'accounts', Entry: 'entries', Card: 'cards', CardEvent: 'cardEvents',
  Budget: 'budgets', Goal: 'goals', GoalEvent: 'goalEvents', Reminder: 'reminders', Asset: 'assets',
  Valuation: 'valuations', Workspace: 'workspaces', Receipt: 'receipts' }

export const demoLimitMessage = 'Você atingiu o limite de operações da demonstração. Ainda é possível consultar todas as informações do aplicativo.'

// Schemas still provide casting, defaults and subdocuments. No mongoose query is executed.
export function createDemoStore() {
  const context = new AsyncLocalStorage()
  const state = () => {
    const value = context.getStore()
    if (!value) throw new Error('Demo storage requires an authenticated session')
    return value
  }
  const models = Object.fromEntries(Object.entries(collections).map(([name, collection]) => {
    const SchemaModel = schemas[name]
    const rows = () => state().data[collection]
    function document(row) {
      const doc = SchemaModel.hydrate(clone(row))
      doc.save = async () => {
        await doc.validate()
        const index = rows().findIndex(item => equal(item._id, doc._id))
        if (index < 0) throw new Error('Missing demo document')
        rows()[index] = clone(doc.toObject())
        return doc
      }
      return doc
    }
    function query(run) {
      let order, projection, lean = false
      const q = {
        session() { return q }, sort(value) { order = value; return q },
        select(value) { projection = value; return q }, lean() { lean = true; return q },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            let result = run()
            if (Array.isArray(result) && order) result.sort((a, b) => {
              for (const [key, direction] of Object.entries(order)) {
                if (at(a, key) < at(b, key)) return -direction
                if (at(a, key) > at(b, key)) return direction
              }
              return 0
            })
            const format = row => {
              if (!row || typeof row !== 'object') return row
              if (!lean) return document(row)
              const result = clone(row)
              if (projection) {
                const fields = projection.split(' ')
                if (fields[0].startsWith('-')) for (const key of fields) delete result[key.slice(1)]
                else for (const key of Object.keys(result)) if (key !== '_id' && !fields.includes(key)) delete result[key]
              }
              return result
            }
            return Array.isArray(result) ? result.map(format) : format(result)
          }).then(resolve, reject)
        },
      }
      return q
    }
    const create = async inputs => Promise.all(inputs.map(async input => {
      const doc = new SchemaModel({ ...input, createdAt: new Date(), updatedAt: new Date() })
      await doc.validate()
      const row = clone(doc.toObject())
      rows().push(row)
      return document(row)
    }))
    async function update(filter, changes, options = {}, many = false) {
      let selected = rows().filter(row => matches(row, filter))
      if (!many) selected = selected.slice(0, 1)
      if (!selected.length && options.upsert) {
        const [doc] = await create([{ ...filter, ...changes.$set }])
        return { matchedCount: 0, upsertedId: doc._id }
      }
      for (const row of selected) {
        const doc = document(row)
        for (const [key, value] of Object.entries(changes.$set ?? {})) doc.set(key, value)
        for (const key of Object.keys(changes.$unset ?? {})) doc.set(key, undefined)
        for (const [key, value] of Object.entries(changes.$inc ?? {})) doc.set(key, (doc.get(key) ?? 0) + value)
        for (const [key, value] of Object.entries(changes.$push ?? {})) { doc.set(key, [...(doc.get(key) ?? []), value]) }
        await doc.save()
      }
      return { matchedCount: selected.length }
    }
    return [name, {
      find: (filter = {}) => query(() => rows().filter(row => matches(row, filter))),
      findOne: filter => query(() => rows().find(row => matches(row, filter)) ?? null),
      findById: id => query(() => rows().find(row => equal(row._id, id)) ?? null),
      exists: filter => query(() => rows().find(row => matches(row, filter)) ? true : null),
      countDocuments: filter => query(() => rows().filter(row => matches(row, filter)).length),
      create, updateOne: update,
      updateMany: (filter, changes, options) => update(filter, changes, options, true),
      deleteOne: async filter => {
        const index = rows().findIndex(row => matches(row, filter))
        if (index >= 0) rows().splice(index, 1)
        return { deletedCount: index >= 0 ? 1 : 0 }
      },
    }]
  }))

  function seed(owner) {
    const data = Object.fromEntries(Object.values(collections).map(key => [key, []]))
    const inputs = clone(raw)
    inputs.valuations = inputs.assets.flatMap(asset => asset.valuations.map(value => ({ ...value, assetId: asset._id })))
    for (const [name, collection] of Object.entries(collections)) {
      data[collection] = (inputs[collection] ?? []).map(row => clone(new schemas[name]({
        ...row, owner, createdAt: new Date(raw.referenceDate), updatedAt: new Date(raw.referenceDate),
      }).toObject()))
    }
    data.workspaces = [{ _id: owner, revision: 0 }]
    return data
  }

  const financialState = data => JSON.stringify(Object.fromEntries(Object.entries(data)
    .filter(([key]) => !['workspaces', 'receipts'].includes(key))))

  const connection = { readyState: 1, async transaction(operation) {
    const scope = state(), session = scope.session
    // Reads and writes share the queue: no partial snapshots, lost updates or quota races.
    if (session.pending >= 8) throw new RequestError(429, 'Muitas operações simultâneas. Tente novamente em instantes.')
    session.pending++
    const previous = session.queue
    let release
    session.queue = new Promise(resolve => { release = resolve })
    await previous
    try {
      if (session.closed || session.until <= Date.now()) throw new RequestError(401, 'Entre para acessar seus registros.')
      scope.data = clone(session.data)
      const result = await operation({})
      if (session.closed || session.until <= Date.now()) throw new RequestError(401, 'Entre para acessar seus registros.')
      const changed = financialState(scope.data) !== financialState(session.data)
      const size = Buffer.byteLength(JSON.stringify(scope.data))
      if (size > 512 * 1024 || Object.values(scope.data).reduce((sum, rows) => sum + rows.length, 0) > 1500) {
        throw new RequestError(429, 'A demonstração atingiu sua capacidade de registros. Continue consultando os dados.')
      }
      if (changed) scope.commit() // Checked synchronously after validation/capacity, before committing.
      session.data = scope.data
      return result
    } finally { session.pending--; release() }
  } }
  return { models, connection, seed, run: (scope, next) => context.run(scope, next) }
}
