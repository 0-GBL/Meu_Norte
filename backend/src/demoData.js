import raw from './demoData.json' with { type: 'json' }
import { accountBalances, day, id, RequestError } from './ledger.js'
import { cardSummary, today } from './cards.js'
import { budgetSummaries, goalSummary, spendingRecords } from './planning.js'
import { periodReport, portfolioPosition, reportComparison, reportSummary } from './reports.js'
import { comparisonPeriod } from '../../shared/reportPeriods.mjs'

// Only immutable fictional inputs. No model, connection, owner or database is used here.
export function demoLedger() {
  const data = structuredClone(raw)
  const cards = data.cards.map(card => cardSummary(card, data.cardEvents.filter(e => e.cardId === card._id), data.referenceDate))
  return { ...accountBalances(data.accounts, data.entries), entries: data.entries, cancelledEntries: [], cards,
    assets: data.assets, reminders: data.reminders, deletedGoals: [],
    goals: data.goals.map(goal => goalSummary(goal, data.goalEvents.filter(e => e.goalId === goal._id))),
    budgets: budgetSummaries(data.budgets, spendingRecords(data.entries, cards)),
    reports: reportSummary(data.entries, data.accounts, cards, data.assets, data.referenceDate.slice(0, 7)) }
}

export function demoReport(query) {
  const from = day(query.from), through = day(query.through)
  const max = new Date(from + 'T00:00:00Z'); max.setUTCFullYear(max.getUTCFullYear() + 5)
  if (from < '1900-01-01' || through > '2199-12-31' || from > through || through > max.toISOString().slice(0,10)) throw new RequestError(400, 'Escolha um período de até cinco anos entre 1900 e 2199.')
  if (query.comparison && !['month','consecutive'].includes(query.comparison)) throw new RequestError(400, 'Escolha uma comparação válida.')
  const accountId = query.account ? id(query.account) : undefined
  const category = typeof query.category === 'string' ? query.category.slice(0,120) : ''
  const type = typeof query.type === 'string' ? query.type : ''
  const assetKind = typeof query.assetKind === 'string' ? query.assetKind : ''
  if (type && !['income','expense','transfer','cardPurchase','cardPayment','assetPurchase','assetSale'].includes(type)) throw new RequestError(400, 'Escolha um tipo de movimentação válido.')
  if (assetKind && !['vehicle','property','equipment','investment','other'].includes(assetKind)) throw new RequestError(400, 'Escolha uma categoria patrimonial válida.')
  const data = structuredClone(raw), currentDay = today(), date = through < currentDay ? through : currentDay
  if (accountId && !data.accounts.some(row => row._id === accountId)) throw new RequestError(404,'Conta não encontrada.')
  const cards = data.cards.map(card => cardSummary(card,data.cardEvents.filter(e => e.cardId === card._id && e.date <= date),date))
  const assets = data.assets.map(asset => ({...asset,valuations:asset.valuations.filter(v => v.date <= date)}))
  const input = { accounts:data.accounts, entries:data.entries.filter(e => e.date <= through), cards, assets, accountId, category, type, assetKind, currentDay }
  const range = comparisonPeriod(from,through,query.comparison)
  const previous = periodReport({...input,assets:[],from:range.from,through:range.through})
  const current = periodReport({...input,from,through})
  return {...current,position:portfolioPosition({...input,date}),comparison:reportComparison(current,previous),
    previous:{...range,income:previous.income,expenses:previous.expenses,cash:previous.cash}}
}
