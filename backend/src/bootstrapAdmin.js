import mongoose from 'mongoose'
import { emailInput, hashPassword } from './auth.js'
import { label, RequestError } from './ledger.js'
import { User, Workspace } from './models.js'

export async function bootstrapAdmin({ name, email, password, legacyOwner }) {
  if (!name && !email && !password && !legacyOwner) return
  const adminName = label(name, 'o nome do administrador')
  const adminEmail = emailInput(email)
  if (legacyOwner && (!/^[\w-]{1,64}$/.test(legacyOwner) || /^[a-f\d]{24}$/i.test(legacyOwner))) {
    throw new RequestError(400, 'O identificador do espaço anterior é inválido.')
  }

  function verifyExisting(user) {
    if (!user || user.email !== adminEmail || (legacyOwner && user.ledgerOwner !== legacyOwner)) {
      throw new RequestError(409, 'A configuração inicial conflita com uma conta ou espaço já existente.')
    }
  }
  const existing = await User.findOne({ role: 'admin' }).lean()
  if (existing) {
    verifyExisting(existing)
    return
  }
  if (typeof password !== 'string' || password.length < 7 || Buffer.byteLength(password) > 72) {
    throw new RequestError(400, 'A senha inicial deve ter pelo menos 7 caracteres e até 72 bytes.')
  }
  const passwordHash = await hashPassword(password)
  try {
    await mongoose.connection.transaction(async session => {
      if (legacyOwner && !await Workspace.exists({ _id: legacyOwner }).session(session)) {
        throw new RequestError(404, 'O espaço financeiro anterior informado não existe.')
      }
      const [created] = await User.create([{
        name: adminName, email: adminEmail, passwordHash, role: 'admin', mustChangePassword: true,
        ...(legacyOwner && { ledgerOwner: legacyOwner }),
      }], { session })
      if (!legacyOwner) await Workspace.create([{ _id: String(created._id), revision: 0 }], { session })
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    verifyExisting(await User.findOne({ role: 'admin' }).lean())
  }
}
