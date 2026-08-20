export const M26_ACTION_REGISTRY=Object.freeze({
  'logout':{roles:['admin','coach','client'],domain:'shell'},
  'add-exercise':{roles:['admin','coach'],domain:'session'},
  'close-group':{roles:['admin','coach'],domain:'session'},
  'exit-session':{roles:['admin','coach','client'],domain:'session'},
  'remove-block':{roles:['admin','coach'],domain:'session'},
  'add-group':{roles:['admin','coach'],domain:'session'},
  'save-draft':{roles:['admin','coach'],domain:'session'},
  'load-template':{roles:['admin','coach'],domain:'session'},
  'save-template':{roles:['admin','coach'],domain:'session'},
  'publish':{roles:['admin','coach'],domain:'session'},
  'preview':{roles:['admin','coach'],domain:'session'},
  'edit-preview':{roles:['admin','coach'],domain:'session'},
  'move-up':{roles:['admin','coach'],domain:'session'},
  'move-down':{roles:['admin','coach'],domain:'session'},
  'start':{roles:['admin','coach','client'],domain:'execution'},
  'complete-set':{roles:['admin','coach','client'],domain:'execution'},
  'previous':{roles:['admin','coach','client'],domain:'execution'},
  'next':{roles:['admin','coach','client'],domain:'execution'},
  'rest-minus':{roles:['admin','coach','client'],domain:'execution'},
  'rest-plus':{roles:['admin','coach','client'],domain:'execution'},
  'substitute':{roles:['admin','coach','client'],domain:'execution'},
  'pause':{roles:['admin','coach','client'],domain:'execution'},
  'resume':{roles:['admin','coach','client'],domain:'execution'},
  'cancel':{roles:['admin','coach','client'],domain:'execution'},
  'finish':{roles:['admin','coach','client'],domain:'execution'},
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
  'complete-iri':{roles:['admin','coach'],domain:'workflow'},
  'validate-plan':{roles:['admin','coach'],domain:'workflow'},
  'create-appointment':{roles:['admin','coach'],domain:'workflow'},
  'open-session-builder':{roles:['admin','coach'],domain:'workflow'},
  'start-published-session':{roles:['admin','coach','client'],domain:'workflow'},
  'generate-intelligence':{roles:['admin','coach'],domain:'workflow'},
  'manage-publication':{roles:['admin','coach'],domain:'publication'},
  'approve-report':{roles:['admin','coach'],domain:'publication'},
});

const ACTION_ATTRIBUTE=/data-(?:session-action|m26-action|engagement-action|verification-action|workflow-action)=["']([^"']+)["']/;

function stripTags(value=''){return value.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
function hasAccessibleName(attrs,body){return Boolean(stripTags(body)||/aria-label=["'][^"']+["']/.test(attrs)||/aria-labelledby=["'][^"']+["']/.test(attrs));}

export function auditInteractiveMarkup(markup=''){
  const errors=[];
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
  return {ok:errors.length===0,errors};
}

export function assertActionAllowed(action,role){
  const entry=M26_ACTION_REGISTRY[action];
  return Boolean(entry&&entry.roles.includes(role));
}
