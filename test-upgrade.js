// Explicit operator tool. Importing this file opens no connection.
const {testConfig}=require('./src/testEnvironment');
const {upgradeTestDatabase}=require('./src/testDatabaseUpgrade');
async function main(){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help'){console.log('node test-upgrade.js --check --writers-stopped | --apply --writers-stopped --backup-verified. Check rehearses DDL then rolls back; all writers must be stopped.');return;}
 if(args.some(a=>!['--check','--apply','--writers-stopped','--backup-verified'].includes(a))||args.includes('--check')===args.includes('--apply'))throw Error('Choose explicit check or apply mode');
 require('dotenv').config({path:'.env.test',quiet:true});
 const config=testConfig(process.env);
 const {Pool}=require('pg');const pool=new Pool({connectionString:config.databaseUrl,max:1,connectionTimeoutMillis:10000});
 try{const result=await upgradeTestDatabase(pool,config,{apply:args.includes('--apply'),writersStopped:args.includes('--writers-stopped'),backupVerified:args.includes('--backup-verified')});console.log(JSON.stringify({event:'test_upgrade_verified',...result}));}finally{await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({event:'test_upgrade_failed',code:error.code||null,message:error.safeMessage||'Upgrade failed; inspect the local configuration and database with the operator.'}));process.exitCode=1;});
module.exports={main};
