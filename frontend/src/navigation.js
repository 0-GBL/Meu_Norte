import { ArrowLeftRight, Bell, ChartNoAxesColumnIncreasing, CreditCard, Goal, House, Landmark, Settings, Shield, WalletCards } from 'lucide-react'

export const overview = { path: '/', label: 'Visão geral', icon: House }

export const modules = [
  { path: '/movimentacoes', label: 'Movimentações', icon: ArrowLeftRight, tone: 'green', description: 'Consulte suas receitas, despesas e transferências.' },
  { path: '/contas', label: 'Contas', icon: Landmark, tone: 'blue', description: 'Veja seus saldos em um só lugar.' },
  { path: '/cartoes', label: 'Cartões de crédito', icon: CreditCard, tone: 'purple', description: 'Acompanhe limites e faturas.' },
  { path: '/orcamentos', label: 'Orçamentos', icon: WalletCards, tone: 'amber', description: 'Planeje seus gastos por categoria.' },
  { path: '/metas', label: 'Metas financeiras', icon: Goal, tone: 'green', description: 'Acompanhe seus planos e conquistas.' },
  { path: '/patrimonio', label: 'Patrimônio', icon: Shield, tone: 'blue', description: 'Consulte seus bens e obrigações.' },
  { path: '/relatorios', label: 'Relatórios', icon: ChartNoAxesColumnIncreasing, tone: 'purple', description: 'Entenda como suas finanças evoluem.' },
  { path: '/lembretes', label: 'Lembretes', icon: Bell, tone: 'amber', description: 'Organize seus próximos compromissos.' },
]

export const settings = { path: '/configuracoes', label: 'Configurações e ajuda', icon: Settings, description: 'Personalize a aparência e conheça os módulos do Meu Norte.' }

// Sidebar labels are independent of the dashboard's approved shortcuts.
const sidebarItem = (path, label) => ({ ...modules.find(item => item.path === path), label })
export const sidebarLinks = [sidebarItem('/movimentacoes', 'Movimentações'), sidebarItem('/contas', 'Contas'), sidebarItem('/cartoes', 'Cartões')]
export const sidebarGroups = [
  { label: 'Planejar', items: [sidebarItem('/orcamentos', 'Orçamentos'), sidebarItem('/metas', 'Metas'), sidebarItem('/lembretes', 'Lembretes')] },
  { label: 'Acompanhar', items: [sidebarItem('/patrimonio', 'Patrimônio'), sidebarItem('/relatorios', 'Relatórios')] },
]
