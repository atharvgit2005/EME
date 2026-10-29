/** Immutable Creative Plans. Publish complete fsynced bytes atomically without replacement. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {CreativePlanValidator}=require('./schema-validator.js');
const {digest,fail}=require('./execution-record.js');
const DEFAULT_STORE_DIR=path.resolve(__dirname,'../../artifacts/creative-plans');
class PlanStore {
  constructor({storeDir=DEFAULT_STORE_DIR}={}){this.storeDir=storeDir;fs.mkdirSync(storeDir,{recursive:true});}
  _path(id){if(!/^creative-plan-[a-zA-Z0-9_-]+$/.test(id || ''))fail('ERR_INVALID_PLAN_ID','Invalid Creative Plan identity');return path.join(this.storeDir,`${id}.json`);}
  _validate(plan){
    if(!CreativePlanValidator.validate(plan).valid)fail('ERR_PLAN_INVALID','Persisted plan violates its canonical contract');
    if(!plan.provenance?.plan_hash || plan.provenance.plan_hash!==CreativePlanValidator.computePlanHash(plan))fail('ERR_PLAN_INTEGRITY_MISMATCH','Creative Plan fingerprint mismatch or missing');
  }
  savePlan(plan){
    const file=this._path(plan?.plan_id);this._validate(plan);
    const temporary=path.join(this.storeDir,`.plan-${process.pid}-${crypto.randomUUID()}.tmp`);
    let fd,created=false;
    try {
      fd=fs.openSync(temporary,'wx',0o600);created=true;fs.writeFileSync(fd,JSON.stringify(plan,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
      try {fs.linkSync(temporary,file);}catch(error){
        if(error.code!=='EEXIST')throw error;
        const existing=this.getPlan(plan.plan_id);
        if(digest(existing)!==digest(plan))fail('ERR_PLAN_ID_CONFLICT','Plan identity already contains different content');
      }
      const directory=fs.openSync(this.storeDir,'r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
      return file;
    }finally{if(fd!==undefined)fs.closeSync(fd);if(created && fs.existsSync(temporary))fs.unlinkSync(temporary);}
  }
  hasPlan(id){return fs.existsSync(this._path(id));}
  getPlan(id){
    const file=this._path(id);if(!fs.existsSync(file))fail('ERR_PLAN_NOT_FOUND',id);
    let plan;try{plan=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){fail('ERR_PLAN_CORRUPTED',error.message);}
    this._validate(plan);if(plan.plan_id!==id)fail('ERR_PLAN_INTEGRITY_MISMATCH','Stored identity mismatch');return plan;
  }
}
module.exports={PlanStore,DEFAULT_STORE_DIR};
