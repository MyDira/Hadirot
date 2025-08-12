#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Metadata describing known email types
const META = {
  sendWelcomeEmail: {
    id: 'welcome_email',
    purpose: 'Welcome new user',
    triggers: ['user signup'],
    subjectExample: 'Welcome to Hadirot',
    functions: ['sendWelcomeEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendAccountDeletedEmail: {
    id: 'account_deleted_email',
    purpose: 'Account deletion notice',
    triggers: ['account deleted'],
    subjectExample: 'Your Hadirot account has been deleted',
    functions: ['sendAccountDeletedEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendListingUpdateEmail: {
    id: 'listing_updated_email',
    purpose: 'Listing updated notification',
    triggers: ['listing updated'],
    subjectExample: 'Listing Updated',
    functions: ['sendListingUpdateEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendListingDeactivationEmail: {
    id: 'listing_deactivated_email',
    purpose: 'Listing deactivated notification',
    triggers: ['listing deactivated'],
    subjectExample: 'Listing Deactivated',
    functions: ['sendListingDeactivationEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendListingReactivationEmail: {
    id: 'listing_reactivated_email',
    purpose: 'Listing reactivated notification',
    triggers: ['listing reactivated'],
    subjectExample: 'Listing Reactivated',
    functions: ['sendListingReactivationEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendListingApprovalEmail: {
    id: 'listing_approved_email',
    purpose: 'Listing approval notification',
    triggers: ['listing approved by admin'],
    subjectExample: 'Listing Approved',
    functions: ['sendListingApprovalEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendListingFeaturedEmail: {
    id: 'listing_featured_email',
    purpose: 'Listing featured status change',
    triggers: ['listing featured status changed'],
    subjectExample: 'Listing Featured',
    functions: ['sendListingFeaturedEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendPermissionChangedEmail: {
    id: 'permission_changed_email',
    purpose: 'Account permissions updated',
    triggers: ['permissions updated'],
    subjectExample: 'Account Permissions Updated',
    functions: ['sendPermissionChangedEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendListingDeletedEmail: {
    id: 'listing_deleted_email',
    purpose: 'Listing deleted notice',
    triggers: ['listing deleted'],
    subjectExample: 'Listing Deleted',
    functions: ['sendListingDeletedEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  sendListingUpdatedEmail: {
    id: 'listing_updated_email',
    purpose: 'Listing updated notification',
    triggers: ['listing updated'],
    subjectExample: 'Listing Updated',
    functions: ['sendListingUpdatedEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  requestPasswordReset: {
    id: 'password_reset_email',
    purpose: 'Password reset instructions',
    triggers: ['user requests password reset'],
    subjectExample: 'Reset your password',
    functions: ['requestPasswordReset', 'sendPasswordResetEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SITE_URL']
  },
  listing_submission_email: {
    id: 'listing_submission_email',
    purpose: 'Listing submission confirmation',
    triggers: ['user posts listing'],
    subjectExample: 'Listing Submitted',
    functions: ['sendEmail', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL']
  },
  account_deletion_email: {
    id: 'account_deletion_email',
    purpose: 'Account deleted by admin',
    triggers: ['admin deletes user'],
    subjectExample: 'Your Hadirot account has been deleted',
    functions: ['delete-user edge', 'renderBrandEmail'],
    env: ['RESEND_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']
  }
};

const results = {};

function addEntry(metaKey, callSite){
  const meta = META[metaKey];
  if(!meta) return;
  if(!results[meta.id]){
    results[meta.id] = {
      id: meta.id,
      purpose: meta.purpose,
      triggers: meta.triggers,
      callSites: [],
      functions: [...meta.functions],
      template: 'renderBrandEmail',
      subjectExample: meta.subjectExample,
      payloadKeys: ['to','subject','html'],
      attachments: false,
      providerPath: 'edge->resend',
      env: meta.env
    };
  }
  if(callSite){
    results[meta.id].callSites.push(callSite);
  }
}

function walk(dir){
  for(const entry of fs.readdirSync(dir, {withFileTypes:true})){
    if(entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if(entry.isDirectory()) walk(full);
    else if(/\.(ts|tsx|js)$/.test(entry.name)) processFile(full);
  }
}

function processFile(file){
  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file,'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx)=>{
    const m = line.match(/emailService\.(send[A-Za-z0-9]+Email)/);
    if(m){
      addEntry(m[1], {file: rel, lines: [idx+1]});
    }
    if(line.includes('emailService.sendEmail') && content.includes('Listing Submitted')){
      addEntry('listing_submission_email', {file: rel, lines: [idx+1]});
    }
    if(line.includes('requestPasswordReset(')){
      addEntry('requestPasswordReset', {file: rel, lines: [idx+1]});
    }
    if(line.includes('fetch') && line.includes('delete-user')){
      addEntry('account_deletion_email', {file: rel, lines: [idx+1]});
    }
  });

  if(/api\.resend\.com/.test(content)){
    if(rel.startsWith('supabase/functions/delete-user')){
      const line = lines.findIndex(l=>l.includes('api.resend.com')) + 1;
      addEntry('account_deletion_email', {file: rel, lines:[line]});
    }
    if(rel.startsWith('supabase/functions/send-password-reset')){
      const line = lines.findIndex(l=>l.includes('api.resend.com')) + 1;
      addEntry('requestPasswordReset', {file: rel, lines:[line]});
    }
  }
}

walk(path.join(ROOT,'src'));
walk(path.join(ROOT,'supabase','functions'));

const inventory = Object.values(results);
fs.writeFileSync(path.join(ROOT,'docs','email-inventory.json'), JSON.stringify(inventory, null, 2));

function toMd(inv){
  const headers = ['id','purpose','trigger(s)','call site(s) (file:line)','function(s) involved','template/renderer','subject example','payload shape (keys)','attachments?','provider path','env vars used'];
  let md = '| ' + headers.join(' | ') + ' |\n';
  md += '| ' + headers.map(()=> '---').join(' | ') + ' |\n';
  inv.forEach(item=>{
    const callSites = item.callSites.map(cs=>`${cs.file}:${cs.lines[0]}`).join('<br>');
    md += `| ${item.id} | ${item.purpose} | ${item.triggers.join(', ')} | ${callSites} | ${item.functions.join(', ')} | ${item.template} | ${item.subjectExample} | ${item.payloadKeys.join(', ')} | ${item.attachments} | ${item.providerPath} | ${item.env.join(', ')} |\n`;
  });
  return md;
}

fs.writeFileSync(path.join(ROOT,'docs','email-inventory.md'), toMd(inventory));
