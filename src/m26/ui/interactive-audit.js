export const M26_ACTION_REGISTRY=Object.freeze({
  'logout':{roles:['admin','coach','client'],domain:'shell'},
  'logout-clear-device':{roles:['admin','coach','client'],domain:'shell'},
  'add-exercise':{roles:['admin','coach'],domain:'session'},
  'close-group':{roles:['admin','coach'],domain:'session'},
  'exit-session':{roles:['admin','coach','client'],domain:'session'},
  'remove-block':{roles:['admin','coach'],domain:'session'},
  'duplicate-block':{roles:['admin','coach'],domain:'session'},
  'add-group':{roles:['admin','coach'],domain:'session'},
  'save-draft':{roles:['admin','coach'],domain:'session'},
  'load-template':{roles:['admin','coach'],domain:'session'},
  'save-template':{roles:['admin','coach'],domain:'session'},
  'publish':{roles:['admin','coach'],domain:'session'},
  'preview':{roles:['admin','coach'],domain:'session'},
  'edit-preview':{roles:['admin','coach'],domain:'session'},
  'move-up':{roles:['admin','coach'],domain:'session'},
  'move-down':{roles:['admin','coach'],domain:'session'},
  'start':{roles:['coach','client'],domain:'execution'},
  'complete-set':{roles:['coach','client'],domain:'execution'},
  'correct-set':{roles:['coach','client'],domain:'execution'},
  'add-set':{roles:['coach'],domain:'execution'},
  'skip-set':{roles:['coach','client'],domain:'execution'},
  'skip-exercise':{roles:['coach','client'],domain:'execution'},
  'add-live-exercise':{roles:['coach'],domain:'execution'},
  'previous':{roles:['coach','client'],domain:'execution'},
  'next':{roles:['coach','client'],domain:'execution'},
  'rest-minus':{roles:['coach','client'],domain:'execution'},
  'rest-plus':{roles:['coach','client'],domain:'execution'},
  'substitute':{roles:['coach','client'],domain:'execution'},
  'pause':{roles:['coach','client'],domain:'execution'},
  'resume':{roles:['coach','client'],domain:'execution'},
  'cancel':{roles:['coach','client'],domain:'execution'},
  'finish':{roles:['coach','client'],domain:'execution'},
  'retry':{roles:['admin','coach','client'],domain:'verification'},
  'inspect':{roles:['admin','coach','client'],domain:'verification'},
  'discard_local':{roles:['admin','coach','client'],domain:'verification'},
  'refresh':{roles:['admin','coach','client'],domain:'verification'},
  'install-update':{roles:['admin','coach','client'],domain:'pwa'},
  'save-checkin-draft':{roles:['admin','coach','client'],domain:'engagement'},
  'submit-checkin':{roles:['admin','coach','client'],domain:'engagement'},
  'save-habit-draft':{roles:['admin','coach'],domain:'engagement'},
  'define-habit':{roles:['admin','coach'],domain:'engagement'},
  'log-habit':{roles:['admin','coach','client'],domain:'engagement'},
  'save-private-note':{roles:['admin','coach'],domain:'engagement'},
  'create-client-draft':{roles:['admin','coach'],domain:'workflow'},
  'complete-iri':{roles:['admin','coach'],domain:'workflow'},
  'save-iri-draft':{roles:['admin','coach'],domain:'workflow'},
  'iri-prev':{roles:['admin','coach'],domain:'workflow'},
  'iri-next':{roles:['admin','coach'],domain:'workflow'},
  'generate-client-iri-report':{roles:['admin','coach','client'],domain:'workflow'},
  'generate-coach-iri-report':{roles:['admin','coach'],domain:'workflow'},
  'validate-plan':{roles:['admin','coach'],domain:'workflow'},
  'create-appointment':{roles:['admin','coach'],domain:'workflow'},
  'confirm-appointment':{roles:['admin','coach'],domain:'workflow'},
  'reuse-session':{roles:['admin','coach'],domain:'workflow'},
  'open-session-builder':{roles:['admin','coach'],domain:'workflow'},
  'start-published-session':{roles:['coach','client'],domain:'workflow'},
  'generate-intelligence':{roles:['admin','coach'],domain:'workflow'},
  'manage-publication':{roles:['admin','coach'],domain:'publication'},
  'approve-report':{roles:['admin','coach'],domain:'publication'},
});

const ACTION_ATTRIBUTE=/data-(?:session-action|m26-action|engagement-action|verification-action|workflow-action)=["']([^"']+)["']/;

function stripTags(value=''){return value.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
function hasAccessibleName(attrs,body){return Boolean(stripTags(body)||/aria-label=["'][^"']+["']/.test(attrs)||/aria-labelledby=["'][^"']+["']/.test(attrs));}
function attributeValue(attrs,name){return attrs.match(new RegExp(`${name}=["']([^"']+)["']`,'i'))?.[1]||'';}

export function auditInteractiveMarkup(markup=''){
  const errors=[];
  const ids=new Set();
  const duplicateIds=new Set();
  for(const match of markup.matchAll(/\bid=["']([^"']+)["']/gi)){
    if(ids.has(match[1]))duplicateIds.add(match[1]);
    ids.add(match[1]);
  }
  for(const id of duplicateIds)errors.push(`DUPLICATE_ID:${id}`);

  const buttonPattern=/<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let match;
  while((match=buttonPattern.exec(markup))){
    const attrs=match[1];
    const body=match[2];
    if(!/\btype=["'](?:button|submit)["']/.test(attrs))errors.push('BUTTON_TYPE_REQUIRED');
    const action=attrs.match(ACTION_ATTRIBUTE);
    if(action&&!M26_ACTION_REGISTRY[action[1]])errors.push(`ACTION_UNREGISTERED:${action[1]}`);
    if(!hasAccessibleName(attrs,body))errors.push('BUTTON_NAME_REQUIRED');
    if(/\bonclick\s*=/.test(attrs))errors.push('INLINE_HANDLER_FORBIDDEN');
    if(/\bdisabled\b/.test(attrs)&&!/aria-disabled=["']true["']/.test(attrs))errors.push('DISABLED_ARIA_REQUIRED');
  }

  const dialogPattern=/<(?:section|div|aside)\b([^>]*\brole=["']dialog["'][^>]*)>/gi;
  while((match=dialogPattern.exec(markup))){
    const attrs=match[1];
    const label=attributeValue(attrs,'aria-label');
    const labelledBy=attributeValue(attrs,'aria-labelledby');
    if(!label&&!labelledBy)errors.push('DIALOG_NAME_REQUIRED');
    if(labelledBy&&!ids.has(labelledBy))errors.push(`DIALOG_LABEL_TARGET_REQUIRED:${labelledBy}`);
  }

  const alertPattern=/<[^>]+\brole=["']alert["'][^>]*>/gi;
  while((match=alertPattern.exec(markup))){
    if(!/aria-live=["']assertive["']/i.test(match[0]))errors.push('ALERT_LIVE_ASSERTIVE_REQUIRED');
  }

  const mainMatch=markup.match(/<main\b([^>]*)\bid=["']m26-main["']([^>]*)>/i);
  if(mainMatch&&!/tabindex=["']-1["']/i.test(`${mainMatch[1]} ${mainMatch[2]}`))errors.push('MAIN_FOCUS_TARGET_REQUIRED');

  return {ok:errors.length===0,errors};
}

export function assertInteractiveMarkup(markup=''){
  const report=auditInteractiveMarkup(markup);
  if(!report.ok)throw new Error(`M26_ACCESSIBILITY_GATE_FAILED:${report.errors.join(',')}`);
  return report;
}

export function assertActionAllowed(action,role){
  const entry=M26_ACTION_REGISTRY[action];
  return Boolean(entry&&entry.roles.includes(role));
}
