export const accounts = [
  { name: 'Conta principal', detail: 'Conta corrente', balance: 542050 },
  { name: 'Reserva', detail: 'Conta poupança', balance: 742500 },
]

export const transactions = [
  { id: 1, name: 'Mercado da semana', category: 'Alimentação', date: '2026-11-08', amount: -18490, account: 'Conta principal', type: 'Despesa variável' },
  { id: 2, name: 'Salário', category: 'Receita', date: '2026-11-06', amount: 580000, account: 'Conta principal', type: 'Receita' },
  { id: 3, name: 'Internet residencial', category: 'Moradia', date: '2026-11-05', amount: -11990, account: 'Conta principal', type: 'Despesa fixa' },
  { id: 4, name: 'Transferência para reserva', category: 'Transferência', date: '2026-11-04', amount: 50000, account: 'Conta principal → Reserva', type: 'Transferência' },
]

export const goals = [
  { name: 'Reserva de emergência', saved: 650000, target: 1000000 },
  { name: 'Viagem de férias', saved: 92500, target: 350000 },
]

export const reminders = [
  { name: 'Vencimento do cartão', detail: 'Cartão do dia a dia', date: '2026-11-15', amount: 24870 },
  { name: 'Revisar valor do notebook', detail: 'Avaliação do patrimônio', date: '2026-11-21' },
]

export const cards = [{ name: 'Cartão do dia a dia', limit: 450000, invoice: 24870, close: 8, due: 15, status: 'Fechada' }]
export const budgets = [
  { name: 'Orçamento geral', limit: 250000, spent: 55350 },
  { name: 'Alimentação', limit: 80000, spent: 43360 },
  { name: 'Moradia', limit: 120000, spent: 11990 },
]
export const assets = [
  { name: 'Notebook', detail: 'Equipamentos', value: 340000, date: '2026-10-21' },
  { name: 'Financiamento pessoal', detail: 'Dívida', value: -125000, date: '2026-11-01' },
]
export const history = [
  { month: 'Jul', receitas: 540000, despesas: 380000 },
  { month: 'Ago', receitas: 540000, despesas: 332000 },
  { month: 'Set', receitas: 560000, despesas: 410000 },
  { month: 'Out', receitas: 580000, despesas: 364000 },
]

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
export const money = cents => currency.format(cents / 100)
export const dateLabel = date => shortDate.format(new Date(date))
export const totalBalance = records => records.reduce((total, { balance }) => total + balance, 0)
export const progress = (current, target) => target > 0 ? Math.round(current / target * 100) : 0

