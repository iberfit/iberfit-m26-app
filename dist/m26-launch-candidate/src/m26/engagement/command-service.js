import { engagementCapabilities } from './activity-capabilities.js';
import { validatedRuntimeRegistry } from '../command-catalog.js';
import { buildCheckinRegisterCommand,buildCheckinVoidCommand,buildHabitDefineCommand,buildHabitLogCommand,buildHabitArchiveCommand,buildPrivateNoteCreateCommand,buildPrivateNoteUpdateCommand,buildPrivateNoteArchiveCommand } from './command-builders.js';

function roleAllowed(role,allowed){const normalized=String(role||'').toLowerCase()==='client'?'cliente':String(role||'').toLowerCase();if(!allowed.includes(normalized))throw new Error('M26_ENGAGEMENT_ROLE_FORBIDDEN');}
export function createEngagementCommandService({commandBus,installedRegistry=[],getRole=()=>null,isOnline=()=>true}={}){
  if(!commandBus?.execute||!commandBus?.enqueue)throw new Error('M26_ENGAGEMENT_COMMAND_BUS_REQUIRED');const runtime=validatedRuntimeRegistry(installedRegistry);if(!runtime.base.ok)throw new Error('M26_BASE_COMMAND_REGISTRY_INVALID');const registry=runtime.registry;const capabilities=engagementCapabilities(registry);const options=()=>({registry,role:getRole()});
  function requireFeature(feature){if(!capabilities[feature]?.ready)throw new Error(`M26_ENGAGEMENT_BACKEND_REQUIRED:${capabilities[feature]?.missing?.join(',')||feature}`);}
  async function submit(command,{offlineAllowed=false}={}){if(!isOnline()&&offlineAllowed)return commandBus.enqueue(command);return commandBus.execute(command);}
  return Object.freeze({
    capabilities,runtimeRegistry:registry,
    async registerCheckin(input){requireFeature('checkins');roleAllowed(getRole(),['admin','coach','cliente']);return submit(buildCheckinRegisterCommand(input,options()),{offlineAllowed:true});},
    async voidCheckin(input){requireFeature('checkins');roleAllowed(getRole(),['admin','coach']);return submit(buildCheckinVoidCommand(input,options()));},
    async defineHabit(input){requireFeature('habits');roleAllowed(getRole(),['admin','coach']);return submit(buildHabitDefineCommand(input,options()));},
    async registerHabit(input){requireFeature('habits');roleAllowed(getRole(),['admin','coach','cliente']);return submit(buildHabitLogCommand(input,options()),{offlineAllowed:true});},
    async archiveHabit(input){requireFeature('habits');roleAllowed(getRole(),['admin','coach']);return submit(buildHabitArchiveCommand(input,options()));},
    async createPrivateNote(input){requireFeature('privateNotes');roleAllowed(getRole(),['admin','coach']);if(!isOnline())throw new Error('M26_PRIVATE_NOTE_ONLINE_REQUIRED');return submit(buildPrivateNoteCreateCommand(input,options()));},
    async updatePrivateNote(input){requireFeature('privateNotes');roleAllowed(getRole(),['admin','coach']);if(!isOnline())throw new Error('M26_PRIVATE_NOTE_ONLINE_REQUIRED');return submit(buildPrivateNoteUpdateCommand(input,options()));},
    async archivePrivateNote(input){requireFeature('privateNotes');roleAllowed(getRole(),['admin','coach']);if(!isOnline())throw new Error('M26_PRIVATE_NOTE_ONLINE_REQUIRED');return submit(buildPrivateNoteArchiveCommand(input,options()));},
  });
}
