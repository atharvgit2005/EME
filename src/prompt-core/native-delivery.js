/** Durable native delivery workflow. Uses the existing job, lock, renderer and integrity authorities. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ApprovalAuthority, durableWrite } = require('../creative/approval-authority.js');
const { loadCommittedSnapshot } = require('../creative/committed-snapshot.js');
const { digest, fail } = require('../creative/execution-record.js');
const { OrchestrationJobManager: Jobs, computeFileSha256BoundedSync: hash } = require('./job-orchestrator.js');
const { ArtifactIntegrityGuardian } = require('../orchestration/artifact-integrity-guardian.js');
const { QualityAssuranceEngine: QA } = require('../renderers/qa-engine.js');

class NativeDelivery {
  constructor({ storageDir = path.resolve(__dirname, '../../.eme/native-deliveries/v1'), approvalDir = ApprovalAuthority.DEFAULT_STORAGE_DIR } = {}) {
    this.storageDir = storageDir; this.approvalDir = approvalDir;
    fs.mkdirSync(path.join(storageDir,'jobs'), { recursive:true });
    fs.mkdirSync(path.join(storageDir,'sessions'), { recursive:true });
    this.guardian = new ArtifactIntegrityGuardian({ rootDir:storageDir, compensationJournalDir:path.join(storageDir,'compensation') });
  }
  jobs() { return new Jobs(path.join(this.storageDir,'jobs')); }
  sessionPath(projectId) { return path.join(this.storageDir,'sessions',`${digest(projectId)}.json`); }
  session(projectId) {
    const file=this.sessionPath(projectId);
    return fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {project_id:projectId,active_delivery:null,deliveries:[]};
  }
  lock(projectId,jobId) { return ApprovalAuthority._coordinator(this.approvalDir).acquireHierarchicalLocks(`approval-project-${digest(projectId)}`,jobId); }
  liveMatches(snapshot) {
    let live;
    if (snapshot.target.mode==='file') live=JSON.parse(fs.readFileSync(snapshot.target.project_path));
    else live=JSON.parse(fs.readFileSync(path.join(this.approvalDir,`head-${digest(snapshot.project.id)}.json`))).project;
    return digest(live)===snapshot.provenance.snapshot_sha256;
  }
  verifyEvidence(manifestPath) {
    const checked=this.guardian.verifyManifest(manifestPath);
    if (!checked.valid) return checked;
    try {
      const m=checked.manifest;
      if (!/^[a-f0-9]{64}$/.test(m.qa_summary.qa_sha256 || '') || hash(m.qa_path)!==m.qa_summary.qa_sha256) throw Error('QA checksum mismatch');
      const qa=JSON.parse(fs.readFileSync(m.qa_path));
      if (qa.status!=='PASSED' || qa.decision!=='PASS' || qa.passed!==true || !qa.checks?.length || !qa.checks.every(c=>c.passed===true) || qa.artifact_sha256!==m.artifact_sha256 || qa.artifact_path!==checked.artifactPath) throw Error('QA binding mismatch');
      return {...checked,qa};
    } catch(error) { return {valid:false,reason:'QA_EVIDENCE_INVALID',message:error.message}; }
  }
  getStatus(jobId) {
    if (!/^job_native_[a-f0-9]{64}$/.test(jobId || '')) fail('ERR_INVALID_JOB_ID','Invalid native job identity');
    const job=this.jobs().loadJob(jobId);
    if (!job) return {status:'NOT_FOUND',jobId};
    const terminal=['SUCCEEDED','FAILED','CANCELLED','NEEDS_RECONCILIATION'];
    if (!terminal.includes(job.status)) {
      const owner=job.native_owner;
      let alive=false;
      if (owner?.hostname===os.hostname()) { try { process.kill(owner.pid,0); alive=true; } catch (_) {} }
      if (!alive) {
        const lock=this.lock(job.request.project_id,jobId);
        try {
          const jm=this.jobs(), current=jm.loadJob(jobId), session=this.session(job.request.project_id);
          const published=session.deliveries.find(d=>d.delivery_id===jobId);
          if (published) {
            const manifest=this.verifyEvidence(published.manifest_path);
            if (manifest.valid) {
              if (current.status !== 'PUBLISHING') fail('ERR_PUBLICATION_STATE_MISMATCH','Published job was not publishing');
              jm.transition(jobId,'SUCCEEDED',{result:{success:true,promoted:true,recovered_after_commit:true,outputPath:manifest.artifactPath,sha256:manifest.sha256,manifestPath:published.manifest_path}});
            } else jm.transition(jobId,'NEEDS_RECONCILIATION',{reconciliation:{reason:'PUBLISHED_ARTIFACT_DRIFT'}});
          } else {
            // No speculative rerender or publication of an interrupted job.
            if (['ACCEPTED','PLANNING'].includes(current.status)) jm.transition(jobId,'FAILED',{error:'Interrupted before render'});
            else jm.transition(jobId,'NEEDS_RECONCILIATION',{reconciliation:{reason:'INTERRUPTED_NATIVE_DELIVERY'}});
          }
        } finally { lock.release(); }
        return this.getStatus(jobId);
      }
    }
    const result={status:job.status,jobId,...job.result};
    if (job.status==='SUCCEEDED') {
      const manifest=this.verifyEvidence(job.result.manifestPath);
      if (!manifest.valid) return {...result,success:false,integrity_status:'INTEGRITY_DRIFT_ALERT',historical_status:'SUCCEEDED'};
    }
    return result;
  }
  run({ executionId, outputDir }) {
    const snapshot=loadCommittedSnapshot(executionId,this.approvalDir);
    fs.mkdirSync(path.resolve(outputDir),{recursive:true});
    const outputRoot=fs.realpathSync(outputDir);
    const jobId=`job_native_${digest({executionId,outputRoot})}`;
    let lock=this.lock(snapshot.project.id,jobId), jm;
    try {
      jm=this.jobs();
      if (jm.loadJob(jobId)) { lock.release();lock=null;return this.getStatus(jobId); }
      jm.createJob({jobId,idempotencyKey:jobId,request:{type:'canonical-native-render',execution_id:executionId,project_id:snapshot.project.id,snapshot_sha256:snapshot.provenance.snapshot_sha256},initialMeta:{native_owner:{pid:process.pid,hostname:os.hostname()}}});
      for (const status of ['PLANNING','READY_TO_EXECUTE','EXECUTING','RENDERING']) jm.transition(jobId,status,{reason:status==='EXECUTING'?'Canonical execution already committed; render only':status});
    } finally { if(lock) lock.release(); }
    let published=false, result;
    try {
      const { RenderOrchestrator }=require('./render-orchestrator.js');
      result=RenderOrchestrator.renderCommitted({executionId,outputDir:outputRoot,storageDir:this.approvalDir});
      jm.transition(jobId,'VERIFYING',{artifacts:{media_path:result.outputPath,media_sha256:result.sha256}});
      const qa=QA.auditFinalMedia(snapshot.project,result.outputPath);
      const qaPath=path.join(path.dirname(result.outputPath),'qa.json');durableWrite(qaPath,qa);
      if (!qa.passed) fail('ERR_FINAL_QA_FAILED',JSON.stringify(qa.checks.filter(c=>!c.passed)));
      const manifest={delivery_id:jobId,project_id:snapshot.project.id,project_revision:snapshot.project.revision,
        artifact_path:result.outputPath,artifact_sha256:result.sha256,artifact_size_bytes:fs.statSync(result.outputPath).size,
        qa_summary:{status:qa.status,decision:qa.decision,qa_sha256:hash(qaPath)},qa_path:qaPath,provenance:result.provenance};
      const manifestPath=path.join(path.dirname(result.outputPath),'manifest.json');durableWrite(manifestPath,manifest);
      jm.transition(jobId,'PUBLISHING',{artifacts:{manifest_path:manifestPath,qa_report_path:qaPath}});
      lock=this.lock(snapshot.project.id,jobId);
      try {
        if (!lock.verifyActive()) fail('ERR_STALE_FENCING_TOKEN','Publication lock lost');
        if (!this.liveMatches(snapshot)) fail('ERR_STALE_PUBLICATION','Live project advanced; historical artifact retained, active delivery unchanged');
        if (hash(result.outputPath)!==qa.artifact_sha256 || hash(qaPath)!==manifest.qa_summary.qa_sha256) fail('ERR_QA_INTEGRITY_MISMATCH','Artifact/QA changed after measurement');
        const session=this.session(snapshot.project.id);
        const verified=this.verifyEvidence(manifestPath);
        if (!verified.valid) fail('ERR_QA_INTEGRITY_MISMATCH',verified.reason);
        const promotion=this.guardian.promoteDeliveryGated({session,candidateDelivery:{delivery_id:jobId},manifestPath,qaReport:qa});
        if (!promotion.promoted) fail('ERR_DELIVERY_WITHHELD',promotion.reason);
        if (!lock.verifyActive()) fail('ERR_STALE_FENCING_TOKEN','Publication fence expired');
        if (!this.liveMatches(snapshot)) fail('ERR_STALE_PUBLICATION','Live project advanced before publication');
        durableWrite(this.sessionPath(snapshot.project.id),session,()=>{published=true;});
        jm.transition(jobId,'SUCCEEDED',{result:{success:true,promoted:true,qaPassed:true,outputPath:result.outputPath,sha256:result.sha256,manifestPath,qaPath,provenance:result.provenance,qa_metrics:qa}});
      } finally { lock.release();lock=null; }
      return this.getStatus(jobId);
    } catch(error) {
      const status=published?'NEEDS_RECONCILIATION':'FAILED';
      try { jm.transition(jobId,status,{error:{code:error.code || 'ERR_NATIVE_DELIVERY',message:error.message,publication_committed:published}}); } catch (_) { /* Durable intermediate state remains recoverable. */ }
      return {success:false,status,jobId,publication_committed:published,error:{code:error.code || 'ERR_NATIVE_DELIVERY',message:error.message},outputPath:result?.outputPath};
    }
  }
}
module.exports={NativeDelivery};
