import fs from 'node:fs';
import {M26_EXTENDED_COMMAND_REGISTRY} from '../src/m26/command-catalog.js';
const rows=M26_EXTENDED_COMMAND_REGISTRY.map((entry)=>({
  command_type:entry.type,entity_type:entry.entityType,event_name:entry.eventName,
  allowed_roles:[...entry.allowedRoles],requires_reason:entry.requiresReason,
  requires_preview:entry.requiresPreview,enabled:entry.enabled,
}));
fs.writeFileSync(new URL('./rc16_command_registry.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(`Exported ${rows.length} command definitions`);
