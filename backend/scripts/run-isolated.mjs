import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// Never load .env or reuse MONGODB_URI / MONGODB_TEST_URI from the host.
const mongo = await MongoMemoryReplSet.create({
  binary: { downloadDir: resolve('node_modules/.cache/mongodb-binaries') },
  replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
})
try {
  const child = spawn(process.execPath, ['--test'], { stdio: 'inherit', windowsHide: true,
    env: { ...process.env, MONGODB_URI: '', MONGODB_TEST_URI: mongo.getUri() } })
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
} finally {
  await mongo.stop()
}
