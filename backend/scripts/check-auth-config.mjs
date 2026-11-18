import { readFileSync, existsSync } from 'node:fs'
import { parse } from 'dotenv'
import { demoConfiguration } from '../src/demo.js'
const env={...(existsSync('.env')?parse(readFileSync('.env')):{}),...process.env}
try {
 const config=demoConfiguration(env)
 console.log(JSON.stringify({status:config.enabled?'INTERACTIVE_DEMO_ENABLED':'PRIVATE_ONLY',demoEmail:config.email,dailyWriteLimit:config.dailyWriteLimit??50,additionalDatabaseRequired:false},null,2))
 if(process.argv.includes('--require-demo')&&!config.enabled)process.exitCode=1
}catch{console.error('Confira DEMO_MODE, DEMO_EMAIL, DEMO_PASSWORD e DEMO_DAILY_WRITE_LIMIT.');process.exitCode=1}
