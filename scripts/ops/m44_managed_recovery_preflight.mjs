// Pure metadata gate; no network, credentials, filesystem or production authorization.
export function certifyManagedRecoveryArchive({pin,run,artifact,nowMs}={}){
 const reject=code=>{throw new Error('M44_MANAGED_PREFLIGHT_'+code);};
 const sha=/^[0-9a-f]{40}$/u, digest=/^[0-9a-f]{64}$/u;
 const positive=n=>Number.isSafeInteger(n)&&n>0;
 if(!pin||!sha.test(pin.sourceSha)||!digest.test(pin.digest)||!positive(pin.runId)||!positive(pin.artifactId)||!positive(pin.bytes)||!Number.isSafeInteger(nowMs)||nowMs<0)reject('PIN_INVALID');
 if(!run||run.id!==pin.runId||run.head_sha!==pin.sourceSha||run.head_branch!=='canary/rc74-4'||run.path!=='.github/workflows/m44-encrypted-disaster-recovery.yml'||!['push','workflow_dispatch'].includes(run.event)||run.status!=='completed'||run.conclusion!=='success')reject('RUN_MISMATCH');
 if(!artifact||artifact.id!==pin.artifactId||artifact.name!=='iberfit-prod-ciphertext-'+pin.runId||artifact.expired!==false||artifact.digest!=='sha256:'+pin.digest||artifact.size_in_bytes!==pin.bytes||artifact.workflow_run?.id!==pin.runId||artifact.workflow_run?.head_sha!==pin.sourceSha||artifact.workflow_run?.head_branch!=='canary/rc74-4')reject('ARTIFACT_MISMATCH');
 const start=Date.parse(run.created_at),end=Date.parse(run.updated_at),created=Date.parse(artifact.created_at),expiry=Date.parse(artifact.expires_at);
 if(![start,end,created,expiry].every(Number.isFinite)||start>created||created>end||end>nowMs||expiry<=created)reject('TIMELINE_INVALID');
 if(nowMs-created>2*60*60*1000||nowMs-end>2*60*60*1000)reject('BACKUP_STALE');
 if(expiry-nowMs<10*60*1000)reject('ARTIFACT_EXPIRING');
 return Object.freeze({metadataVerified:true,sourceSha:pin.sourceSha,runId:pin.runId,artifactId:pin.artifactId,ciphertextBytesVerified:false,archiveDecrypted:false,managedRecoveryVerified:false,platformRecoveryVerified:false,productionAuthorized:false});
}
