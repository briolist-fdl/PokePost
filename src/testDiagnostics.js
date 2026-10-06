const fs=require('node:fs'),path=require('node:path');
const KEEP_DAYS=7,MAX_DAILY_BYTES=5*1024*1024;
function createTestDiagnostics({directory=path.join(__dirname,'../.test-logs'),now=()=>new Date(),onError=()=>{}}={}){
 const root=path.resolve(directory);
 function folder(){
  if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw Error('Log directory must not be a symbolic link');
  fs.mkdirSync(root,{recursive:true});
  if(!fs.lstatSync(root).isDirectory())throw Error('Log directory is invalid');
 }
 function day(){const current=now();if(!(current instanceof Date)||!Number.isFinite(+current))throw Error('Invalid log clock');return current;}
 function prune(){try{
  folder();const current=day(),oldest=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),current.getUTCDate())-(KEEP_DAYS-1)*86400000).toISOString().slice(0,10);
  for(const entry of fs.readdirSync(root)){
   const match=/^test-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(entry);if(!match||match[1]>=oldest)continue;
   const stamp=new Date(match[1]+'T00:00:00Z');if(!Number.isFinite(+stamp)||stamp.toISOString().slice(0,10)!==match[1])continue;
   const target=path.resolve(root,entry);if(path.dirname(target)!==root)throw Error('Invalid log path');
   const stat=fs.lstatSync(target);if(stat.isFile()&&!stat.isSymbolicLink())fs.unlinkSync(target);
  }
 }catch{onError();}}
 function write(level,value){try{
  folder();let input=value;
  if(typeof input==='string'){try{input=JSON.parse(input);}catch{input=null;}}
  const stamp=day(),entry={time:stamp.toISOString(),level,event:/^(poke_post_|test_)[a-z0-9_]{1,70}$/.test(input?.event||'')?input.event:'test_unstructured_log'};
  if(typeof input?.errorCode==='number'&&Number.isSafeInteger(input.errorCode))entry.errorCode=input.errorCode;
  else if(typeof input?.errorCode==='string'&&/^[A-Z0-9_]{1,32}$/.test(input.errorCode))entry.errorCode=input.errorCode;
  for(const key of ['guildId','userId','actorId','channelId','messageId'])if(typeof input?.[key]==='string'&&/^\d{17,20}$/.test(input[key]))entry[key]=input[key];
  const target=path.resolve(root,'test-'+stamp.toISOString().slice(0,10)+'.jsonl');
  if(fs.existsSync(target)){const stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid log file');if(stat.size>=MAX_DAILY_BYTES)return;}
  fs.appendFileSync(target,JSON.stringify(entry)+'\n',{encoding:'utf8',mode:0o600});
 }catch{onError();}}
 return {log:value=>write('info',value),info:value=>write('info',value),warn:value=>write('warn',value),error:value=>write('error',value),prune};
}
module.exports={createTestDiagnostics,KEEP_DAYS};
