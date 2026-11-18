import { readFileSync, existsSync } from 'node:fs'
import { parse } from 'dotenv'
import { demoConfiguration } from '../src/demo.js'
const env={...(existsSync('.env')?parse(readFileSync('.env')):{}),...process.env}
try {
 const config=demoConfiguration(env)
 console.log(JSON.stringify({status:config.enabled?'STATIC_DEMO_ENABLED':'PRIVATE_ONLY',demoEmail:config.email,additionalDatabaseRequired:false},null,2))
 if(process.argv.includes('--require-demo')&&!config.enabled)process.exitCode=1
}catch{console.error('Confira DEMO_MODE, DEMO_EMAIL e DEMO_PASSWORD.');process.exitCode=1}
