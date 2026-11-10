import mongoose from 'mongoose'

const { Schema } = mongoose
const owner = { type: String, required: true }
const options = { timestamps: true, versionKey: false }

const account = new Schema({
  owner, name: String, kind: String, initialBalance: Number,
  archived: { type: Boolean, default: false },
}, options)
account.index({ owner: 1, createdAt: 1 })

const entry = new Schema({
  owner, type: String, description: String, amount: Number, date: String,
  accountId: Schema.Types.ObjectId, destinationId: Schema.Types.ObjectId,
  category: String, expenseKind: String,
}, options)
entry.index({ owner: 1, date: -1, createdAt: -1, _id: -1 })

const card = new Schema({
  owner, name: String, limit: Number, close: Number, due: Number, archived: Boolean,
}, options)
card.index({ owner: 1, createdAt: 1 })

const cardEvent = new Schema({
  owner, cardId: Schema.Types.ObjectId, type: String, date: String, amount: Number,
  description: String, category: String, installments: Number, invoice: String,
  accountId: Schema.Types.ObjectId, purchaseId: Schema.Types.ObjectId,
}, options)
cardEvent.index({ owner: 1, cardId: 1, date: 1, _id: 1 })

const budget = new Schema({ owner, month: String, category: String, categoryKey: String, limit: Number }, options)
budget.index({ owner: 1, month: -1, categoryKey: 1 }, { unique: true })

const goal = new Schema({ owner, name: String, target: Number, monthly: Number, status: String }, options)
goal.index({ owner: 1, createdAt: 1 })

const goalEvent = new Schema({ owner, goalId: Schema.Types.ObjectId, amount: Number, date: String }, options)
goalEvent.index({ owner: 1, goalId: 1, date: -1, _id: -1 })

const reminder = new Schema({
  owner, name: String, dueOn: String, frequency: String, amount: Number, anchor: Number,
  snoozedUntil: String, status: String, lastConfirmedOn: String,
}, options)
reminder.index({ owner: 1, status: 1, dueOn: 1 })

const asset = new Schema({
  owner, name: String, kind: String, acquired: Number, accountId: Schema.Types.ObjectId, reviewOn: String,
}, options)
asset.index({ owner: 1, createdAt: 1 })

const valuation = new Schema({ owner, assetId: Schema.Types.ObjectId, value: Number, date: String }, options)
valuation.index({ owner: 1, assetId: 1, date: -1, _id: -1 })

const user = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  sessionVersion: { type: Number, default: 0 },
}, options)

const accessToken = new Schema({
  _id: String, owner: Schema.Types.ObjectId, version: Number, expiresAt: Date,
}, { versionKey: false })
accessToken.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const workspace = new Schema({ _id: String, revision: { type: Number, default: 0 } }, { versionKey: false })
const receipt = new Schema({ _id: String, fingerprint: { type: String, required: true } }, { versionKey: false })

export const Account = mongoose.model('Account', account)
export const Entry = mongoose.model('Entry', entry)
export const Workspace = mongoose.model('Workspace', workspace)
export const Receipt = mongoose.model('LedgerReceipt', receipt)
export const Card = mongoose.model('Card', card)
export const CardEvent = mongoose.model('CardEvent', cardEvent)
export const Budget = mongoose.model('Budget', budget)
export const Goal = mongoose.model('Goal', goal)
export const GoalEvent = mongoose.model('GoalEvent', goalEvent)
export const Reminder = mongoose.model('Reminder', reminder)
export const Asset = mongoose.model('Asset', asset)
export const Valuation = mongoose.model('Valuation', valuation)
export const User = mongoose.model('User', user)
export const Session = mongoose.model('Session', accessToken)
export const ResetToken = mongoose.model('ResetToken', accessToken)
