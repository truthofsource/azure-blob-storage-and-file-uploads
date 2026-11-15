// Fictional inputs run through actual extracted platform rules; no Azure or SQL calls.
import {documentTypeConfig} from '../src/documents/documentCatalog.ts';
import {documentAccessPlan} from '../src/documents/documentAccess.ts';
import {getStage2DocumentUploadDecision} from '../src/stage2/stage2DocumentUploadRules.ts';
const result={
  scope:'Local rules only. No real upload, scan verdict, identity verification or database transaction.',
  collections:Object.entries(documentTypeConfig).map(([type,v])=>({type,...v})),
  access:['HR','Payroll','Admin','Caregiver'].map(role=>({role,...documentAccessPlan(['Workforce.'+role])})),
  uploads:[
    {name:'New PNG identity photo',decision:getStage2DocumentUploadDecision('in_progress','government_issued_photo_id','document','pending','image/png',0,false)},
    {name:'Replace unaccepted JPG',decision:getStage2DocumentUploadDecision('changes_requested','government_issued_photo_id','document','changes_requested','image/jpeg',1,false)},
    {name:'Attempt to replace an accepted document',decision:getStage2DocumentUploadDecision('in_progress','government_issued_photo_id','document','submitted','image/png',1,true)},
    {name:'PDF sent to photo-only item',decision:getStage2DocumentUploadDecision('in_progress','government_issued_photo_id','document','pending','application/pdf',0,false)}
  ],
  stages:[
    ['1','Validate request','Check file size, declared type, byte signature and packet state. A valid header is not a malware verdict.'],
    ['2','Store privately','Use the API managed identity to write the intake object with a unique document ID and a conditional create.'],
    ['3','Record the receipt','Store the person, actor, type, content hash, size and uploaded object version.'],
    ['4','Wait for the file check','Pending, failed or unknown results do not authorize a download. The scanner is covered in its own project.'],
    ['5','Release and retrieve','The full application correlates the clean result with the exact file and checks access again before serving it.']
  ]
};
console.log(JSON.stringify(result,null,2));
