// Preparation only: presets never supply results, execution validity or symptoms.
export const IRI_SETUP_PRESETS=Object.freeze({
  trx:Object.freeze({trxHandleHeightCm:'100',trxPosition:'Rodillas extendidas',trxDurationSeconds:'60'}),
  knees:Object.freeze({pushVariant:'knees'}),
  floor:Object.freeze({posteriorProtocolVariant:'floor-mat-adapted',thomasProtocolVariant:'floor-mat-observation'}),
  treadmill:Object.freeze({cardioProtocol:'treadmill-3min-field',cardioDurationSeconds:'180',treadmillInclinePercent:'0'}),
});

export function applyIriSetupPreset(form,key){
  const values=IRI_SETUP_PRESETS[key];
  if(!values)return false;
  for(const [name,value] of Object.entries(values)){
    const field=form?.elements?.namedItem?.(name);
    if(field)field.value=value;
  }
  return true;
}
